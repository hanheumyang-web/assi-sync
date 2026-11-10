/* 같은 이름 다른 분류 폴더가 한 작업으로 합쳐짐 막기 — 컴퓨터 앱 쪽 (11/10). 실행: node test/same-name-folders.test.js
 * 깨지면 무엇을 잃나: HOME/소현 · PORTRAIT/소현 사진이 한 작업에 섞이고 켤 때마다 경로가 뒤집힌다(11/4 포트레이트262 시험 올리기).
 * 반대로 너무 막으면: 분류만 옮긴 폴더(AD/촬영 → BEAUTY/촬영)가 새 작업이 되고 사진을 다시 올린다.
 * 서버 대역만 — 실제 서버 · 계정에 닿지 않는다. 폴더는 임시 폴더에 만들고 지운다.
 */
const fs = require('fs'), path = require('path'), os = require('os')
const M = require(path.join(__dirname, '..', 'lib', 'sync-engine.js')); const Engine = M.SyncEngine || M
const { 지금있는작업폴더, 따로살아있나, 짝찾기만들기 } = require(path.join(__dirname, '..', 'lib', 'folder-present.js'))

let fail = 0
const ok = (n, c, extra) => { console.log((c ? '  ✅ ' : '  ❌ ') + n + (extra ? '  ' + extra : '')); if (!c) fail++ }
const head = t => console.log(`\n${'━'.repeat(64)}\n${t}`)
const jpg = (p, size = 2000) => { fs.mkdirSync(path.dirname(p), { recursive: true }); const b = Buffer.alloc(size); b[0] = 0xFF; b[1] = 0xD8; fs.writeFileSync(p, b) }
const 폴더 = (files) => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pofol-same-')); for (const f of files) jpg(path.join(root, f)); return root }

/* 서버 대역 — getProjectsByUid · getAssetsByProject · updateProject 만 (sync-cases.test.js 와 같은 모양) */
function 대역(projects) {
  const 부른것 = { update: [], find: [] }
  const api = {
    getProjectsByUid: async () => ({ projects }),
    getAssetsByProject: async () => ({ assets: [] }),
    listAssetsSince: async () => ({ assets: [], nextSince: null, nextCursor: null, hasMore: false, mode: 'inc', deletedProjects: [] }),
    updateProject: async (id, data) => { 부른것.update.push({ id, data }); return {} },
    findOrCreateProject: async (name, category, folderKey, presentKeys) => { 부른것.find.push({ name, category, folderKey, presentKeys }); return { projectId: 'new-' + folderKey, created: true } },
    getProject: async id => ({ id, uid: 'u1' }),
  }
  return { api, 부른것 }
}

;(async () => {
console.log('코드:', require(path.join(__dirname, '..', 'package.json')).version)

head('1. 지금 있는 작업 폴더 — 사진이 바로 든 폴더만 (휴지통 · 숨김 · 감시 폴더 바로 아래 파일 · 빈 폴더는 빼고)')
{
  const root = 폴더(['HOME/소현/a.jpg', 'PORTRAIT/소현/b.jpg', 'AD/나이키/캠페인1/c.jpg', '_trash/옛것/d.jpg', '.hidden/x/e.jpg', 'top.jpg'])
  fs.mkdirSync(path.join(root, 'EMPTY', '빈폴더'), { recursive: true })
  fs.writeFileSync(path.join(root, 'HOME', '메모.txt'), 'x')
  const keys = 지금있는작업폴더(root, { isSupported: n => /\.jpg$/i.test(n), isIgnored: n => n.startsWith('.') || n === '_trash' }).sort()
  ok('셋만 나온다', JSON.stringify(keys) === JSON.stringify(['AD/나이키/캠페인1', 'HOME/소현', 'PORTRAIT/소현']), JSON.stringify(keys))
  fs.rmSync(root, { recursive: true, force: true })
}

head('2. 새 작업을 찾을 때 지금 있는 작업 폴더 목록을 서버에 같이 보낸다')
{
  const root = 폴더(['HOME/소현/a.jpg', 'PORTRAIT/소현/b.jpg'])
  const { api, 부른것 } = 대역([])
  const e = new Engine({ uid: 'u1', watchDir: root, statePath: path.join(root, '.state.json'), api })
  await e.findOrCreateProject('소현', 'PORTRAIT/소현', 'PORTRAIT')
  const 보낸 = 부른것.find[0]?.presentKeys || []
  ok('경로 둘이 같이 갔다', [...보낸].sort().join('|') === 'HOME/소현|PORTRAIT/소현', JSON.stringify(보낸))
  ok('찾는 폴더 경로는 그대로', 부른것.find[0]?.folderKey === 'PORTRAIT/소현')
  fs.rmSync(root, { recursive: true, force: true })
}

head('3. 켤 때 짝짓기 — HOME/소현 작업이 있고 PORTRAIT/소현 이 새로 생김 → PORTRAIT/소현 은 그 작업을 가져가지 않는다')
{
  const root = 폴더(['HOME/소현/a.jpg', 'PORTRAIT/소현/b.jpg'])
  const { api, 부른것 } = 대역([{ id: 'P1', name: '소현', category: 'HOME', syncedCategory: 'HOME', folderKey: 'HOME/소현', folderName: '소현', syncedName: '소현' }])
  const e = new Engine({ uid: 'u1', watchDir: root, statePath: path.join(root, '.state.json'), api })
  await e.syncStateWithServer()
  ok('HOME/소현 → P1', e.projectCache.get('HOME/소현') === 'P1')
  ok('PORTRAIT/소현 은 P1 에 안 붙음 (나중에 새 작업)', e.projectCache.get('PORTRAIT/소현') !== 'P1', String(e.projectCache.get('PORTRAIT/소현')))
  ok('P1 경로를 PORTRAIT/소현 으로 바꾸지 않음', !부른것.update.some(u => u.id === 'P1' && u.data.folderKey === 'PORTRAIT/소현'))
  /* 순서를 바꿔도 (PORTRAIT 가 먼저 훑여도) 같다 — 이름 순서가 A 로 시작하는 분류 */
  fs.rmSync(root, { recursive: true, force: true })
  const root2 = 폴더(['ZHOME/소현/a.jpg', 'APORTRAIT/소현/b.jpg'])
  const d2 = 대역([{ id: 'P1', name: '소현', category: 'ZHOME', folderKey: 'ZHOME/소현', folderName: '소현', syncedName: '소현' }])
  const e2 = new Engine({ uid: 'u1', watchDir: root2, statePath: path.join(root2, '.state.json'), api: d2.api })
  await e2.syncStateWithServer()
  ok('먼저 훑인 APORTRAIT/소현 도 P1 을 안 가져감', e2.projectCache.get('APORTRAIT/소현') !== 'P1' && e2.projectCache.get('ZHOME/소현') === 'P1')
  fs.rmSync(root2, { recursive: true, force: true })
}

head('4. 분류만 옮긴 폴더 — 옛 폴더가 없으면 예전처럼 이어 쓴다 (다시 올리지 않음)')
{
  const root = 폴더(['BEAUTY/촬영/a.jpg'])
  const { api, 부른것 } = 대역([{ id: 'P1', name: '촬영', category: 'AD', syncedCategory: 'AD', folderKey: 'AD/촬영', folderName: '촬영', syncedName: '촬영' }])
  const e = new Engine({ uid: 'u1', watchDir: root, statePath: path.join(root, '.state.json'), api })
  await e.syncStateWithServer()
  ok('BEAUTY/촬영 → P1 (이어 씀)', e.projectCache.get('BEAUTY/촬영') === 'P1')
  ok('P1 경로를 새 자리로 심음', 부른것.update.some(u => u.id === 'P1' && u.data.folderKey === 'BEAUTY/촬영'))
  fs.rmSync(root, { recursive: true, force: true })
}

head('5. 경로가 없는 옛 작업 하나 + 같은 이름 폴더 둘 — 하나만 이어 쓴다')
{
  const root = 폴더(['HOME/소현/a.jpg', 'PORTRAIT/소현/b.jpg'])
  const { api } = 대역([{ id: 'OLD', name: '소현', category: 'HOME' }])
  const e = new Engine({ uid: 'u1', watchDir: root, statePath: path.join(root, '.state.json'), api })
  await e.syncStateWithServer()
  const 붙은 = ['HOME/소현', 'PORTRAIT/소현'].filter(k => e.projectCache.get(k) === 'OLD')
  ok('옛 작업은 한 폴더에만', 붙은.length === 1, JSON.stringify(붙은))
  fs.rmSync(root, { recursive: true, force: true })
}

head('6. 규칙 한 줄 — 맥 한글(풀어 쓴 꼴)과 관리자가 넣은 경로(모아 쓴 꼴)는 같은 경로')
{
  const 맥 = s => s.normalize('NFD')
  ok('따로 살아 있음', 따로살아있나(new Set(['HOME/소현']), { folderKey: 맥('HOME/소현') }, 'PORTRAIT/소현'))
  ok('제 경로는 막지 않음', !따로살아있나(new Set(['HOME/소현']), { folderKey: 'HOME/소현' }, 맥('HOME/소현')))
  ok('목록이 없으면 막지 않음 (옛 동작)', !따로살아있나(null, { folderKey: 'HOME/소현' }, 'PORTRAIT/소현'))
  const 찾기 = 짝찾기만들기({ byFolderKey: new Map(), byFolderName: new Map([['소현', { id: 'P1', folderKey: 'HOME/소현' }]]), serverProjects: new Map(), 있는폴더: () => [맥('HOME/소현'), 'PORTRAIT/소현'] })
  ok('짝찾기도 같은 규칙', 찾기('PORTRAIT/소현', '소현') === undefined)
}

console.log(`\n${fail ? '❌ ' + fail + '개 실패' : '✅ 모두 통과'}`)
process.exit(fail ? 1 : 0)
})()

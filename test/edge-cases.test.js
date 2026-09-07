/* 까다로운 경우들 — 실행: node test/edge-cases.test.js
   여기 있는 것들은 "그럴 리 없다" 고 넘겼다가 사용자 파일을 잃는 종류다. */
const fs = require('fs'), path = require('path'), os = require('os')
const M = require(path.join(__dirname, '..', 'lib', 'sync-engine.js'))
const Engine = M.SyncEngine || M

let fail = 0, n = 0
const ok = (t, c, x) => { console.log((c ? '  ✅ ' : '  ❌ ') + t + (x ? '  ' + x : '')); if (!c) fail++ }
const head = t => { n++; console.log(`\n${'━'.repeat(64)}\n${n}. ${t}`) }
const ls = p => fs.existsSync(p) ? fs.readdirSync(p).filter(x => x !== '.DS_Store').sort() : []

function mk() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-'))
  const e = new Engine({ uid: 'u1', watchDir: root, statePath: path.join(root, '.s.json'), api: {} })
  return { root, e }
}
function put(root, rel, bytes) {
  const abs = path.join(root, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, Buffer.alloc(bytes, 7))
  return fs.statSync(abs).size
}
function track(e, rel, assetId, projectId, size) {
  e.state.syncedFiles[rel] = { assetId, projectId, fileSize: size }
}

// ────────────────────────────────────────────────────────────
head('서로 다른 프로젝트에 이름도 크기도 같은 파일이 있다 — 엉뚱한 짝을 맺으면 안 된다')
{
  const { root, e } = mk()
  const a = 'FASHION/프로젝트A/IMG_0001.jpg'
  const b = 'BEAUTY/프로젝트B/IMG_0001.jpg'
  const sz = put(root, a, 50000); put(root, b, 50000)
  track(e, a, 'assetA', 'PA', sz); track(e, b, 'assetB', 'PB', sz)

  // A 만 진짜로 지운다. B 는 그대로 있다.
  fs.unlinkSync(path.join(root, a))
  let asked = null
  e.onFolderDeletionRequested = i => { asked = i }
  const r = e.reconcileLocalDeletions()

  ok('B 가 있다고 해서 A 를 "옮겨졌다" 로 보면 안 된다', r.missing === 1,
     `(옮김 ${r.moved || 0} · 지움 ${r.missing})`)
  ok('A 가 지워진 것으로 사람에게 물었다', !!asked && asked.projectId === 'PA')
  ok('B 의 기록은 멀쩡하다', e.state.syncedFiles[b]?.assetId === 'assetB')
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('같은 프로젝트 안에서만 옮겨진 경우는 옮김으로 봐야 한다')
{
  const { root, e } = mk()
  const from = 'FASHION/프로젝트A/IMG_0001.jpg'
  const to = 'Instagram/프로젝트A/IMG_0001.jpg'
  const sz = put(root, from, 50000)
  track(e, from, 'assetA', 'PA', sz)
  fs.mkdirSync(path.join(root, 'Instagram/프로젝트A'), { recursive: true })
  fs.renameSync(path.join(root, from), path.join(root, to))

  let asked = null
  e.onFolderDeletionRequested = i => { asked = i }
  const r = e.reconcileLocalDeletions()
  ok('옮김으로 알아봤다', r.moved === 1, `(옮김 ${r.moved} · 지움 ${r.missing})`)
  ok('물어보지 않았다', !asked)
  ok('기록이 새 자리로 갔다', !!e.state.syncedFiles[to] && !e.state.syncedFiles[from])
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('휴지통 안의 파일이 "옮겨진 것" 으로 잘못 잡히면 안 된다')
{
  const { root, e } = mk()
  const rel = 'FASHION/프로젝트A/IMG_0001.jpg'
  const sz = put(root, rel, 50000)
  track(e, rel, 'assetA', 'PA', sz)
  // 사용자가 파일을 휴지통으로 옮겼다 = 치운 것이다
  fs.mkdirSync(path.join(root, '_Trash/뭔가'), { recursive: true })
  fs.renameSync(path.join(root, rel), path.join(root, '_Trash/뭔가/IMG_0001.jpg'))

  let asked = null
  e.onFolderDeletionRequested = i => { asked = i }
  const r = e.reconcileLocalDeletions()
  ok('휴지통은 "있는 자리" 로 치지 않는다', r.missing === 1, `(옮김 ${r.moved || 0} · 지움 ${r.missing})`)
  /* 휴지통 말고는 보이는 파일이 하나도 없는 상태다.
     이럴 땐 '사용자가 다 치웠다' 와 '폴더를 못 읽는다' 를 구별할 수 없으므로 판단하지 않는다. */
  ok('보이는 파일이 없으니 판단을 미룬다', r.skipped === 'looks-like-unmounted' && !asked)
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('빈 파일(0바이트)이 섞여 있어도 헷갈리면 안 된다')
{
  const { root, e } = mk()
  const a = 'FASHION/P/빈파일1.txt', b = 'FASHION/P/빈파일2.txt'
  put(root, a, 0); put(root, b, 0)
  track(e, a, 'assetA', 'PA', 0); track(e, b, 'assetB', 'PA', 0)
  fs.unlinkSync(path.join(root, a))
  const r = e.reconcileLocalDeletions()
  ok('이름이 다르면 서로 짝이 되지 않는다', r.missing === 1, `(옮김 ${r.moved || 0} · 지움 ${r.missing})`)
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('한글·공백·이모지가 든 이름도 그대로 다뤄야 한다')
{
  const { root, e } = mk()
  const from = 'PERSONAL WORK/아저씨는 따봉이야 👍/사진 (1) 최종_final.jpg'
  const to = 'Instagram/아저씨는 따봉이야 👍/사진 (1) 최종_final.jpg'
  const sz = put(root, from, 12345)
  track(e, from, 'assetA', 'PA', sz)
  fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true })
  fs.renameSync(path.join(root, from), path.join(root, to))
  const r = e.reconcileLocalDeletions()
  ok('옮김으로 알아봤다', r.moved === 1)
  ok('새 경로가 기록에 들어갔다', !!e.state.syncedFiles[to])
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('파일 크기 기록이 없으면 옮김 판정을 하지 않는다 (근거 없는 짝짓기 금지)')
{
  const { root, e } = mk()
  const from = 'FASHION/P/a.jpg', to = 'Instagram/P/a.jpg'
  put(root, from, 500)
  e.state.syncedFiles[from] = { assetId: 'assetA', projectId: 'PA' }   // 크기 없음
  fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true })
  fs.renameSync(path.join(root, from), path.join(root, to))
  const r = e.reconcileLocalDeletions()
  ok('짝을 함부로 맺지 않는다', r.moved === 0 || r.moved === undefined, `(옮김 ${r.moved || 0})`)
  ok('지워진 것으로 보고 사람에게 맡긴다', r.missing === 1)
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('감시 폴더가 통째로 사라졌다 (외장하드 뽑음) — 아무것도 하지 않는다')
{
  const { root, e } = mk()
  const rel = 'FASHION/P/a.jpg'
  const sz = put(root, rel, 100)
  track(e, rel, 'assetA', 'PA', sz)
  const gone = root + '-없음'
  e.watchDir = gone
  let asked = false
  e.onFolderDeletionRequested = () => { asked = true }
  const r = e.reconcileLocalDeletions()
  ok('폴더가 없으면 판단 자체를 안 한다', r.skipped === 'watchdir-missing')
  ok('사람을 귀찮게 하지 않는다', !asked)
  ok("'치웠다' 표시도 안 남긴다", !Object.keys(e.state.locallyRemoved || {}).length)
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('폴더를 통째로 재정리했다 — 100% 가 옮겨져도 삭제로 오해하면 안 된다')
{
  const { root, e } = mk()
  const files = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg']
  files.forEach((f, i) => {
    const rel = `옛카테고리/프로젝트/${f}`
    const sz = put(root, rel, 1000 + i)
    track(e, rel, 'asset' + i, 'PA', sz)
  })
  fs.mkdirSync(path.join(root, '새카테고리'), { recursive: true })
  fs.renameSync(path.join(root, '옛카테고리/프로젝트'), path.join(root, '새카테고리/프로젝트'))
  fs.rmSync(path.join(root, '옛카테고리'), { recursive: true, force: true })

  let asked = false
  e.onFolderDeletionRequested = () => { asked = true }
  const r = e.reconcileLocalDeletions()
  ok('5장 전부 옮김으로 봤다', r.moved === 5, `(옮김 ${r.moved} · 지움 ${r.missing})`)
  ok('"웹에서도 지울까요?" 를 띄우지 않는다', !asked)
  ok('사진 5장 다 있다', ls(path.join(root, '새카테고리/프로젝트')).length === 5)
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('휴지통 30일 정리 — 오래된 것만 지우고 최근 것은 남긴다')
{
  const { root, e } = mk()
  const old = path.join(root, '_Trash', '오래된 것 (2026-01-01 00-00-00)')
  const recent = path.join(root, '_Trash', '최근 것 (2026-09-01 00-00-00)')
  for (const d of [old, recent]) fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(old, 'x.jpg'), 'x')
  fs.writeFileSync(path.join(recent, 'y.jpg'), 'y')
  const iso = d => new Date(d).toISOString()
  fs.writeFileSync(path.join(old, '.meta.json'), JSON.stringify({ projectId: 'P1', deletedAt: iso('2026-01-01') }))
  fs.writeFileSync(path.join(recent, '.meta.json'), JSON.stringify({ projectId: 'P2', deletedAt: iso(Date.now() - 3 * 86400000) }))
  await_(e.cleanupLocalTrash())
  ok('30일 지난 것은 지워졌다', !fs.existsSync(old))
  ok('최근 것은 남아 있다', fs.existsSync(recent))
  fs.rmSync(root, { recursive: true, force: true })
}
function await_(p) { return p }

// ────────────────────────────────────────────────────────────
head('되돌리기 — 휴지통 폴더에 사용자가 넣어둔 파일은 지우면 안 된다')
{
  const { root, e } = mk()
  const rel = 'FASHION/P/a.jpg'
  const sz = put(root, rel, 800)
  track(e, rel, 'assetA', 'PA', sz)
  const dir = path.join(root, '_Trash', 'P (2026-09-07 00-00-00)')
  fs.mkdirSync(dir, { recursive: true })
  fs.renameSync(path.join(root, rel), path.join(dir, 'a.jpg'))
  fs.writeFileSync(path.join(dir, '내가 따로 넣어둔 메모.txt'), '지우지 마')
  fs.writeFileSync(path.join(dir, '.meta.json'), JSON.stringify({
    projectId: 'PA', items: [{ assetId: 'assetA', relPath: rel, file: 'a.jpg' }],
  }))
  e.restoreProjectFromLocalTrash(dir)
  ok('사진은 제자리로 돌아왔다', fs.existsSync(path.join(root, rel)))
  ok('사용자 메모는 살아 있다', fs.existsSync(path.join(dir, '내가 따로 넣어둔 메모.txt')))
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('되돌릴 자리를 모르는 옛 휴지통 폴더 — 지우지 말고 그대로 둔다')
{
  const { root, e } = mk()
  const dir = path.join(root, '_Trash', 'P (2026-09-07 00-00-00)')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'a.jpg'), 'aaa')
  fs.writeFileSync(path.join(dir, '.meta.json'), JSON.stringify({ projectId: 'PA' }))  // items 없음
  const back = e.restoreProjectFromLocalTrash(dir)
  ok('아무것도 되돌리지 않았다', back === 0)
  ok('폴더와 사진을 지우지 않았다', fs.existsSync(path.join(dir, 'a.jpg')))
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head("잘못 남은 '치웠다' 표시 걷어내기 — 있는 것만 걷고 없는 것은 둔다")
{
  const { root, e } = mk()
  const there = 'FASHION/P/있다.jpg', gone = 'FASHION/P/없다.jpg'
  const sz = put(root, there, 300)
  track(e, there, 'assetThere', 'PA', sz)
  track(e, gone, 'assetGone', 'PA', 300)
  e.markLocallyRemoved('assetThere', there)
  e.markLocallyRemoved('assetGone', gone)
  const cleared = e.cleanupStaleRemovalMarks()
  ok('파일이 있는 쪽 표시만 걷었다', cleared === 1, `(${cleared}건)`)
  ok('정말 없는 쪽 표시는 남겼다', !!e.state.locallyRemoved['assetGone'])
  ok('있는 쪽 표시는 사라졌다', !e.state.locallyRemoved['assetThere'])
  fs.rmSync(root, { recursive: true, force: true })
}

;(async () => {
// ────────────────────────────────────────────────────────────
head('웹에도 이미 없는 프로젝트면 "웹에서도 지울까요?" 를 묻지 않는다')
{
  const { root, e } = mk()
  const rel = 'AD/이미없는프로젝트/a.jpg'
  const sz = put(root, rel, 700)
  put(root, 'AD/살아있는프로젝트/b.jpg', 800)   // 보이는 파일이 있어야 판단이 돈다
  track(e, rel, 'assetA', 'GONE', sz)
  track(e, 'AD/살아있는프로젝트/b.jpg', 'assetB', 'ALIVE', 800)
  fs.unlinkSync(path.join(root, rel))
  /* 서버에는 ALIVE 만 있고 GONE 은 없다 */
  e.api = { getProjectsByUid: async () => ({ projects: [{ id: 'ALIVE', name: '살아있는프로젝트' }] }) }
  let asked = null
  e.onFolderDeletionRequested = i => { asked = i }
  e.reconcileLocalDeletions()
  await new Promise(r => setTimeout(r, 50))
  ok('묻지 않았다 (이미 웹에도 없으니까)', !asked, asked ? JSON.stringify(asked.folderKey) : '')
}

// ────────────────────────────────────────────────────────────
head('서버를 못 물어보면 예전처럼 묻는다 (조용히 넘기지 않는다)')
{
  const { root, e } = mk()
  const rel = 'AD/어떤프로젝트/a.jpg'
  const sz = put(root, rel, 700)
  put(root, 'AD/다른프로젝트/b.jpg', 800)
  track(e, rel, 'assetA', 'P1', sz)
  track(e, 'AD/다른프로젝트/b.jpg', 'assetB', 'P2', 800)
  fs.unlinkSync(path.join(root, rel))
  e.api = { getProjectsByUid: async () => { throw new Error('통신 안 됨') } }
  let asked = null
  e.onFolderDeletionRequested = i => { asked = i }
  e.reconcileLocalDeletions()
  await new Promise(r => setTimeout(r, 50))
  ok('물어봤다', !!asked, asked ? asked.folderKey : '없음')
}


console.log('\n' + '━'.repeat(64))
console.log(fail ? `실패 ${fail}건` : `${n}가지 까다로운 경우 전부 통과`)
  process.exit(fail ? 1 : 0)
})()

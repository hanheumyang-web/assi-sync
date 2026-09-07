/* 지우는 길들이 약속을 지키는지 — 실행: node test/delete-safety.test.js

   ⚠️ 2026-09-07. 앱의 '이 폴더 지우기' 는 서버의 사진 파일 자체를 지우는
      영구 삭제였다. 그런데 앱의 다른 모든 곳과 웹사이트는 "휴지통에 30일 보관" 이라고
      안내한다. 사용자는 되돌릴 수 있다고 믿고 누른다.
      약속과 동작이 어긋나는 건 그 자체로 사고다. */
const fs = require('fs'), path = require('path'), os = require('os')
const M = require(path.join(__dirname, '..', 'lib', 'sync-engine.js'))
const Engine = M.SyncEngine || M

let fail = 0, n = 0
const ok = (t, c, x) => { console.log((c ? '  ✅ ' : '  ❌ ') + t + (x ? '  ' + x : '')); if (!c) fail++ }
const head = t => { n++; console.log(`\n${'━'.repeat(64)}\n${n}. ${t}`) }

function mk(apiCalls) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'del-'))
  const api = {
    softDeleteProject: async id => { apiCalls.push(['softDeleteProject', id]); return { ok: true } },
    deleteProject: async id => { apiCalls.push(['deleteProject', id]); return { ok: true } },
    deleteAsset: async id => { apiCalls.push(['deleteAsset', id]); return { ok: true } },
    deleteFile: async p => { apiCalls.push(['deleteFile', p]); return { ok: true } },
    getProject: async () => null,
  }
  const e = new Engine({ uid: 'u1', watchDir: root, statePath: path.join(root, '.s.json'), api })
  return { root, e }
}

;(async () => {

head("'이 폴더 지우기' 는 되돌릴 수 있어야 한다 (영구 삭제 금지)")
{
  const calls = []
  const { root, e } = mk(calls)
  const key = 'AD/내프로젝트'
  for (const f of ['a.jpg', 'b.jpg']) {
    const abs = path.join(root, key, f)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, 'x'.repeat(100))
    e.state.syncedFiles[`${key}/${f}`] = {
      assetId: 'as_' + f, projectId: 'P1', storagePath: 'u/' + f, fileSize: 100,
    }
  }
  e.triggerDownloadPollNow = async () => {}
  const r = await e.deleteSyncedFolder(key)

  const names = calls.map(c => c[0])
  ok('휴지통으로 보냈다 (softDeleteProject)', names.includes('softDeleteProject'), `호출: ${names.join(', ') || '없음'}`)
  ok('저장소의 사진 파일을 지우지 않았다 (deleteFile)', !names.includes('deleteFile'))
  ok('자산을 완전 삭제하지 않았다 (deleteAsset)', !names.includes('deleteAsset'))
  ok('프로젝트를 완전 삭제하지 않았다 (deleteProject)', !names.includes('deleteProject'))
  ok('성공을 알렸다', r?.ok === true)
  /* 기록을 남겨둬야 로컬 원본을 옮길 때 '정말 우리 것인지' 확인할 수 있다 */
  ok('올린 기록을 지우지 않았다 (신원 확인의 근거)', Object.keys(e.state.syncedFiles).length === 2)
  ok('컴퓨터의 원본은 아직 그대로다', fs.existsSync(path.join(root, key, 'a.jpg')))
  fs.rmSync(root, { recursive: true, force: true })
}

head('올린 적 없는 폴더를 지우라고 하면 — 서버를 건드리지 않는다')
{
  const calls = []
  const { root, e } = mk(calls)
  const r = await e.deleteSyncedFolder('AD/올린적없음')
  ok('서버 호출이 하나도 없다', calls.length === 0, `호출: ${calls.length}건`)
  ok('실패를 알렸다', r?.ok === false)
  fs.rmSync(root, { recursive: true, force: true })
}

head('프로젝트를 못 찾은 사진 — 정체불명 폴더를 지어내지 않는다')
{
  const calls = []
  const { root, e } = mk(calls)
  const r = await e.downloadRemoteAsset({
    id: 'orphan1', fileName: '고아사진.jpg', projectId: 'ZZZ없는프로젝트',
    url: 'https://example.invalid/x.jpg', storagePath: 'u/x', fileSize: 1234,
  })
  ok('건너뛰었다', r?.skipped === true, `이유: ${r?.reason}`)
  ok('사유가 분명하다', r?.reason === 'project-not-found')
  const dirs = fs.readdirSync(root).filter(x => !x.startsWith('.'))
  ok('_UNCATEGORIZED 같은 폴더를 만들지 않았다', dirs.length === 0, `생긴 것: ${dirs.join(', ') || '없음'}`)
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('\n' + '━'.repeat(64))
console.log(fail ? `실패 ${fail}건` : `${n}가지 전부 통과`)
process.exit(fail ? 1 : 0)
})().catch(e => { console.error('터짐:', e); process.exit(1) })

/* 기존 사용자가 **폴더를 새로 파서** 다시 동기화하는 경우 — 테스터가 겪은 상황과 가장 가깝다.
   테스트 계정(애플 릴레이)으로 실제 웹에 붙어서 돈다. */
const fs = require('fs'), path = require('path'), os = require('os')
const DESK = path.join(os.homedir(), 'work', 'assi-proto', 'desktop')
const ApiMod = require(path.join(DESK, 'lib', 'api-client.js'))
const ApiClient = ApiMod.ApiClient || ApiMod
const EngMod = require(path.join(DESK, 'lib', 'sync-engine.js'))
const SyncEngine = EngMod.SyncEngine || EngMod
const sharp = require(path.join(DESK, 'node_modules', 'sharp'))

const CFG = path.join(os.homedir(), 'Library/Application Support/assi-sync/config.json')
const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'))
const PREFIX = 'ZZ_새폴더_'
const PROJ = PREFIX + '작업'

let fail = 0
const ok = (t, c, x) => { console.log((c ? '  ✅ ' : '  ❌ ') + t + (x ? '  ' + x : '')); if (!c) fail++ }
const head = t => console.log(`\n${'━'.repeat(60)}\n${t}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const api = () => new ApiClient({ idToken: cfg.idToken, refreshToken: cfg.refreshToken, onTokenRefreshed: () => {} })
async function waitFor(fn, ms = 120000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await fn()) return true; await sleep(2500) }
  return false
}
async function jpegs(dir, n, seed) {
  fs.mkdirSync(dir, { recursive: true })
  const out = []
  for (let i = 0; i < n; i++) {
    const buf = await sharp({ create: { width: 380 + i * 17, height: 260, channels: 3,
      background: { r: 30 + seed * 20 + i * 9, g: 110, b: 190 } } }).jpeg({ quality: 80 }).toBuffer()
    const name = `새폴더_${String(i + 1).padStart(2, '0')}.jpg`
    fs.writeFileSync(path.join(dir, name), buf)
    out.push(name)
  }
  return out
}
function makeEngine(watchDir, statePath) {
  const events = { asks: [] }
  const e = new SyncEngine({
    uid: cfg.uid, watchDir, statePath, api: api(),
    onNewFolder: () => true, onFileStatus: () => {}, onError: () => {},
    onFolderDeletionRequested: i => events.asks.push(i),
  })
  /* 이 시험과 무관한 계정의 다른 자산이 딸려오지 않게 */
  const orig = e.downloadRemoteAsset.bind(e)
  e.downloadRemoteAsset = async (asset) => {
    const p = await api().getProject(asset.projectId).catch(() => null)
    if (!p || !(p.name || '').startsWith(PREFIX)) return { skipped: true, reason: '시험 아님' }
    return orig(asset)
  }
  e._events = events
  return e
}
const countFiles = d => {
  if (!fs.existsSync(d)) return 0
  let n = 0
  for (const x of fs.readdirSync(d, { withFileTypes: true })) {
    if (x.name.startsWith('.') || x.name === '_Trash') continue
    n += x.isDirectory() ? countFiles(path.join(d, x.name)) : 1
  }
  return n
}
const liveAssets = async (pid) => ((await api().getAssetsByProject(pid)).assets || []).filter(a => !a.deletedAt)

;(async () => {
  const oldDir = path.join(os.homedir(), 'Desktop', '_시험 옛폴더')
  const newDir = path.join(os.homedir(), 'Desktop', '_시험 새폴더')
  for (const d of [oldDir, newDir]) fs.rmSync(d, { recursive: true, force: true })
  const state = path.join(os.tmpdir(), 'newfolder-state.json')
  fs.rmSync(state, { force: true })

  head('① 옛 폴더에서 평범하게 동기화해 둔다 (기존 사용자 상태 만들기)')
  const names = await jpegs(path.join(oldDir, 'AD', PROJ), 3, 1)
  const sizes = Object.fromEntries(names.map(n => [n, fs.statSync(path.join(oldDir, 'AD', PROJ, n)).size]))
  const e1 = makeEngine(oldDir, state)
  await e1.start()
  const up = await waitFor(async () => {
    const p = ((await api().getProjectsByUid()).projects || []).find(x => x.name === PROJ && !x.deletedAt)
    return p && (await liveAssets(p.id)).length === names.length
  })
  ok('사진 3장이 웹에 올라갔다', up)
  const proj = ((await api().getProjectsByUid()).projects || []).find(x => x.name === PROJ && !x.deletedAt)
  if (!proj) { console.log('업로드 실패 — 중단'); process.exit(1) }
  ok('앱 기록 3개가 쌓였다', Object.keys(e1.state.syncedFiles).length === names.length)
  try { e1.stop?.() } catch {}
  await sleep(1500)

  head('② 사용자가 폴더를 새로 파고 앱을 거기로 돌린다 (기록은 앱이 비운다)')
  fs.mkdirSync(newDir, { recursive: true })
  /* main.js 가 감시 폴더 변경을 감지하면 하는 일 그대로 */
  fs.rmSync(state, { force: true })
  const e2 = makeEngine(newDir, state)
  await e2.start()
  await sleep(20000)

  ok('빈 새 폴더에 아무것도 안 쏟아졌다', countFiles(newDir) === 0, `${countFiles(newDir)}개`)
  ok('"웹에서도 지울까요?" 를 안 띄웠다', e2._events.asks.length === 0, `${e2._events.asks.length}건`)
  const stillThere = await liveAssets(proj.id)
  ok('웹의 사진 3장이 그대로 살아 있다', stillThere.length === names.length, `${stillThere.length}장`)
  const projStill = ((await api().getProjectsByUid()).projects || []).find(x => x.id === proj.id)
  ok('웹의 프로젝트가 휴지통에 안 들어갔다', projStill && !projStill.deletedAt)
  ok('옛 폴더의 사진은 손대지 않았다', countFiles(oldDir) === names.length, `${countFiles(oldDir)}개`)

  head('③ 사용자가 옛 폴더에서 사진을 복사해 온다 — 다시 올라가면 안 된다')
  const dstDir = path.join(newDir, 'AD', PROJ)
  fs.mkdirSync(dstDir, { recursive: true })
  for (const n of names) fs.copyFileSync(path.join(oldDir, 'AD', PROJ, n), path.join(dstDir, n))
  await e2.syncStateWithServer()
  await sleep(20000)

  const after = await liveAssets(proj.id)
  ok('웹의 사진이 3장 그대로다 (6장으로 안 늘었다)', after.length === names.length, `${after.length}장`)
  const projs = ((await api().getProjectsByUid()).projects || []).filter(x => x.name.startsWith(PREFIX) && !x.deletedAt)
  ok('프로젝트가 하나뿐이다 (중복 생성 없음)', projs.length === 1, `${projs.length}개`)
  const rec = Object.entries(e2.state.syncedFiles)
  ok('복사해 온 3장을 이미 올린 것으로 알아봤다', rec.length === names.length, `${rec.length}개`)
  ok('그 기록에 파일 크기가 들어 있다 (안전장치의 근거)', rec.every(([, v]) => v.fileSize > 0))
  ok('새 폴더의 사진이 그대로다', countFiles(newDir) === names.length)

  head('④ 그 상태에서 웹이 삭제 신호를 보내면 — 신원 확인이 도는가')
  const before = countFiles(newDir)
  await api().softDeleteProject(proj.id)
  await e2.triggerDownloadPollNow()
  await sleep(4000)
  const trash = path.join(newDir, '_Trash')
  const movedOk = fs.existsSync(trash)
  ok('휴지통으로 옮겨졌다 (우리가 올린 그 파일이 맞으므로)', movedOk)
  if (movedOk) {
    const td = fs.readdirSync(trash)[0]
    const inside = fs.readdirSync(path.join(trash, td)).filter(x => x !== '.meta.json')
    ok('3장이 휴지통 안에 있다', inside.length === names.length, `${inside.length}장`)
    const meta = JSON.parse(fs.readFileSync(path.join(trash, td, '.meta.json'), 'utf8'))
    ok('원래 자리가 기록됐다 (되돌릴 수 있다)', Array.isArray(meta.items) && meta.items.length === names.length)
    e2.restoreProjectFromLocalTrash(path.join(trash, td))
    ok('되살리면 제자리로 돌아온다', countFiles(newDir) === before, `${countFiles(newDir)}개`)
    const back = Object.fromEntries(fs.readdirSync(dstDir).map(n => [n, fs.statSync(path.join(dstDir, n)).size]))
    ok('사진이 손상 없이 같다', JSON.stringify(back) === JSON.stringify(sizes))
  }

  head('⑤ 뒷정리')
  try { e2.stop?.() } catch {}
  await api().deleteProject(proj.id)
  const left = ((await api().getProjectsByUid()).projects || []).filter(x => (x.name || '').startsWith(PREFIX))
  ok('시험 프로젝트가 남지 않았다', left.length === 0, `${left.length}개`)
  for (const d of [oldDir, newDir]) fs.rmSync(d, { recursive: true, force: true })
  fs.rmSync(state, { force: true })
  ok('시험 폴더를 지웠다', !fs.existsSync(oldDir) && !fs.existsSync(newDir))

  console.log('\n' + (fail ? `실패 ${fail}건` : '전부 통과 — 폴더를 새로 파는 경우도 이상 없다'))
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('터짐:', e); process.exit(1) })

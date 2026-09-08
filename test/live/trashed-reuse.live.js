/* 테스터 사고 재현 — 휴지통에 든 사진을 앱이 '재사용' 하고 넘어가서 웹에 안 보이던 것.
   (Korea Blockchain Week: 맥 3개, 웹 2개. 앱은 "재사용 — 재업로드 없음" 이라고 했다.)

   시험 계정(애플 릴레이)으로 실제 웹에 붙어서 돈다. 대표님 폴더는 건드리지 않는다.
   돌리는 법: node test/live/trashed-reuse.live.js */
const fs = require('fs'), path = require('path'), os = require('os')
const DESK = path.join(os.homedir(), 'work', 'assi-proto', 'desktop')
const ApiMod = require(path.join(DESK, 'lib', 'api-client.js'))
const ApiClient = ApiMod.ApiClient || ApiMod
const EngMod = require(path.join(DESK, 'lib', 'sync-engine.js'))
const SyncEngine = EngMod.SyncEngine || EngMod
const sharp = require(path.join(DESK, 'node_modules', 'sharp'))

const CFG = path.join(os.homedir(), 'Library/Application Support/assi-sync/config.json')
const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'))
if (!String(cfg.email || '').includes('privaterelay')) { console.error('시험 계정이 아니다 — 멈춘다'); process.exit(2) }
const PREFIX = 'ZZ_휴지통재사용_'
/* ⚠️ 매 실행마다 새 이름 — 2026-09-08. 앞 실행이 남긴 같은 이름의 프로젝트(휴지통)를 서버가
      되살려 쓰면서 사진 개수가 기대와 어긋나 ①에서 세 번 연속 막혔다. 시험은 깨끗한 판에서 시작한다. */
const PROJ = PREFIX + new Date().toISOString().slice(11, 19).replace(/:/g, '')

let fail = 0
const ok = (t, c, x) => { console.log((c ? '  ✅ ' : '  ❌ ') + t + (x ? '  ' + x : '')); if (!c) fail++ }
const head = t => console.log(`\n${'━'.repeat(60)}\n${t}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const api = () => new ApiClient({ idToken: cfg.idToken, refreshToken: cfg.refreshToken, onTokenRefreshed: () => {} })
async function waitFor(fn, ms = 120000) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(2500) } return false }
const allAssets = async (pid) => ((await api().getAssetsByProject(pid)).assets || [])
const liveAssets = async (pid) => (await allAssets(pid)).filter(a => !a.deletedAt)
const findProj = async () => ((await api().getProjectsByUid()).projects || []).find(x => x.name === PROJ && !x.deletedAt)
function makeEngine(watchDir, statePath) {
  const e = new SyncEngine({ uid: cfg.uid, watchDir, statePath, api: api(),
    onNewFolder: () => true, onFileStatus: () => {}, onError: () => {}, onFolderDeletionRequested: () => {} })
  const orig = e.downloadRemoteAsset.bind(e)
  e.downloadRemoteAsset = async (asset) => {
    const p = await api().getProject(asset.projectId).catch(() => null)
    if (!p || !(p.name || '').startsWith(PREFIX)) return { skipped: true, reason: '시험 아님' }
    return orig(asset)
  }
  return e
}

;(async () => {
  const dir = path.join(os.homedir(), 'Desktop', '_시험 휴지통재사용')
  fs.rmSync(dir, { recursive: true, force: true })
  const state = path.join(os.tmpdir(), 'trashed-reuse-state.json'); fs.rmSync(state, { force: true })
  const folder = path.join(dir, 'AD', PROJ); fs.mkdirSync(folder, { recursive: true })
  const names = []
  for (let i = 0; i < 2; i++) {
    const buf = await sharp({ create: { width: 400 + i * 23, height: 270, channels: 3, background: { r: 200 - i * 40, g: 60 + i * 30, b: 90 } } }).jpeg({ quality: 80 }).toBuffer()
    const n = `휴지통_${i + 1}.jpg`; fs.writeFileSync(path.join(folder, n), buf); names.push(n)
  }

  head('① 사진 2장을 평범하게 올려 둔다')
  const e1 = makeEngine(dir, state); await e1.start()
  const up = await waitFor(async () => { const p = await findProj(); return p && (await liveAssets(p.id)).length === 2 })
  const proj = await findProj()
  ok('2장이 웹에 올라갔다', up, proj ? `(프로젝트 ${proj.id} · 전체 ${(await allAssets(proj.id)).length}장 · 살아있는 ${(await liveAssets(proj.id)).length}장 · 앱 기록 ${Object.keys(e1.state.syncedFiles).length}개)` : '(프로젝트를 못 찾음)')
  if (!proj || !up) { console.log('업로드 실패 — 중단'); process.exit(1) }
  try { e1.stop?.() } catch {}
  await sleep(1500)

  head('② 그중 한 장을 (예전 중복 정리처럼) 휴지통에 넣는다 — 파일은 맥 폴더에 그대로')
  const [victim] = await liveAssets(proj.id)
  await api().trashAssets([victim.id])
  const afterTrash = await allAssets(proj.id)
  ok('웹에서는 1장만 살아 있다', afterTrash.filter(a => !a.deletedAt).length === 1)
  ok('1장이 휴지통 표시다', afterTrash.filter(a => a.deletedAt).length === 1)

  head('③ 앱 기록을 비우고 같은 폴더를 다시 동기화한다 (새 설치·새 폴더와 같은 상황)')
  fs.rmSync(state, { force: true })
  const e2 = makeEngine(dir, state); await e2.start()
  const recovered = await waitFor(async () => (await liveAssets(proj.id)).length === 2, 90000)
  ok('휴지통에 있던 사진이 다시 살아났다 (2장 다 보인다)', recovered, `${(await liveAssets(proj.id)).length}장`)
  const total = await allAssets(proj.id)
  ok('새로 올려서 3장이 된 게 아니다 — 같은 사진을 꺼낸 것이다', total.length === 2, `${total.length}장`)
  ok('휴지통 표시가 남아 있지 않다', total.every(a => !a.deletedAt))
  try { e2.stop?.() } catch {}

  head('④ 뒷정리')
  await api().softDeleteProject(proj.id).catch(() => {})
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(state, { force: true })
  console.log(`\n${'━'.repeat(60)}\n` + (fail ? `${fail}가지 실패` : '전부 통과'))
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('시험 자체가 터졌다:', e); process.exit(1) })

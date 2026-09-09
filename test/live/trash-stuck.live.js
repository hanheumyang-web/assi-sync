/* 테스터 제보 재현 — "동기화 새로고침 계속 해봤는데 웹에서는 자꾸 파일이 안 보이네" (2026-09-09)
   ① 사진을 올린다 → 웹에 보인다
   ② 웹에서 그 사진을 휴지통에 넣는다 (예전 사고로 이렇게 된 것들이 있다)
   ③ 싱크앱이 같은 파일을 다시 올린다 → **휴지통에서 나와야 한다**
   ④ 이미 '올렸다' 고 적힌 상태로 앱을 다시 켜도 → **갇힌 사진이 되살아나야 한다** */
const fs = require('fs'), path = require('path'), os = require('os')
const DESK = path.join(os.homedir(), 'work', 'assi-proto', 'desktop')
const M = require(path.join(DESK, 'lib', 'api-client.js')); const ApiClient = M.ApiClient || M
const E = require(path.join(DESK, 'lib', 'sync-engine.js')); const SyncEngine = E.SyncEngine || E
const sharp = require(path.join(DESK, 'node_modules', 'sharp'))
const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), 'Library/Application Support/assi-sync/config.json'), 'utf8'))
if (!String(cfg.email || '').includes('privaterelay')) { console.error('시험 계정이 아니다 — 멈춘다'); process.exit(2) }

let fail = 0
const ok = (t, c, x) => { console.log((c ? '  ✅ ' : '  ❌ ') + t + (x ? '  ' + x : '')); if (!c) fail++ }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const api = () => new ApiClient({ idToken: cfg.idToken, refreshToken: cfg.refreshToken, onTokenRefreshed: () => {} })
const RUN = Date.now().toString().slice(-5)
const P = 'ZZ갇힘' + RUN
const root = path.join(os.homedir(), 'Desktop', `_시험 갇힘${RUN}`)
const state = path.join(os.tmpdir(), `stuck-${RUN}.json`)
const mk = () => { const e = new SyncEngine({ uid: cfg.uid, watchDir: root, statePath: state, api: api(), onNewFolder: () => true, onFileStatus: () => {}, onError: () => {}, onFolderDeletionRequested: () => {} }); e.downloadRemoteAsset = async () => ({ skipped: true }); return e }
const assets = async pid => ((await api().getAssetsByProject(pid)).assets || [])
const live = async pid => (await assets(pid)).filter(a => !a.deletedAt)
const proj = async () => ((await api().getProjectsByUid()).projects || []).find(x => x.name === P && !x.deletedAt)
const wait = async (fn, ms = 120000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(2500) } return false }

;(async () => {
  fs.mkdirSync(path.join(root, 'AD', P), { recursive: true })
  const buf = await sharp({ create: { width: 380, height: 260, channels: 3, background: { r: 90, g: 40, b: 200 } } }).jpeg().toBuffer()
  fs.writeFileSync(path.join(root, 'AD', P, '하나.jpg'), buf)
  fs.writeFileSync(path.join(root, 'AD', P, '둘.jpg'), await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 10, g: 190, b: 90 } } }).jpeg().toBuffer())

  let e = mk(); await e.start()
  ok('사진 2장이 올라갔다', await wait(async () => { const p = await proj(); return p && (await live(p.id)).length === 2 }))
  const p = await proj(); if (!p) { console.log('중단'); process.exit(1) }
  try { e.stop?.() } catch {}

  // ② 웹에서 한 장을 휴지통에 (다른 장이 남아 있어 서버가 막지 않는다)
  const 하나 = (await live(p.id)).find(a => a.fileName === '하나.jpg')
  await api().trashAssets([하나.id])
  ok('웹에서 한 장을 휴지통에 넣었다', (await live(p.id)).length === 1)

  // ③ 기록을 비우고 다시 올린다 = 같은 파일을 새로 올리는 길
  fs.rmSync(state, { force: true })
  e = mk(); await e.start()
  ok('다시 올리니 휴지통에서 나왔다 (2장)', await wait(async () => (await live(p.id)).length === 2, 90000), `${(await live(p.id)).length}장`)
  ok('사진이 늘어나지 않았다 (같은 것을 꺼낸 것)', (await assets(p.id)).length === 2, `전체 ${(await assets(p.id)).length}장`)
  try { e.stop?.() } catch {}

  // ④ '이미 올렸다' 고 적힌 채로 휴지통에 갇힌 경우 — 앱을 다시 켜면 낫는가
  const 다시 = (await live(p.id)).find(a => a.fileName === '하나.jpg')
  await api().trashAssets([다시.id])
  ok('다시 휴지통에 넣었다 (앱 기록은 그대로 "올림")', (await live(p.id)).length === 1)
  e = mk(); await e.start()
  ok('앱을 다시 켜니 갇힌 사진이 되살아났다', await wait(async () => (await live(p.id)).length === 2, 90000), `${(await live(p.id)).length}장`)
  try { e.stop?.() } catch {}

  await api().softDeleteProject(p.id).catch(() => {})
  fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(state, { force: true })
  console.log(fail ? `\n${fail}가지 실패` : '\n전부 통과')
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('터짐', e); process.exit(1) })

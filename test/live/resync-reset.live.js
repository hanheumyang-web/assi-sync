/* 폴더를 정리한 뒤 "웹을 폴더 기준으로 다시 연결" 이 실제로 맞추는지 (2026-09-09)
   ① 프로젝트 두 개를 올린다
   ② 폴더 하나의 이름을 바꾼다 (사람이 정리한 상황) → 웹에는 옛 이름이 남는다
   ③ 다시 연결 → 폴더에 있는 것만 살아 있고, 없는 것은 휴지통으로
   ④ 폴더가 웹보다 훨씬 적으면 막는다 */
const fs = require('fs'), path = require('path'), os = require('os')
const DESK = path.join(os.homedir(), 'work', 'assi-proto', 'desktop')
const M = require(path.join(DESK, 'lib', 'api-client.js')); const ApiClient = M.ApiClient || M
const E = require(path.join(DESK, 'lib', 'sync-engine.js')); const SyncEngine = E.SyncEngine || E
const sharp = require(path.join(DESK, 'node_modules', 'sharp'))
const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), 'Library/Application Support/assi-sync/config.json'), 'utf8'))
if (!String(cfg.email || '').includes('privaterelay')) { console.error('시험 계정이 아니다'); process.exit(2) }

let fail = 0
const ok = (t, c, x) => { console.log((c ? '  ✅ ' : '  ❌ ') + t + (x ? '  ' + x : '')); if (!c) fail++ }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const api = () => new ApiClient({ idToken: cfg.idToken, refreshToken: cfg.refreshToken, onTokenRefreshed: () => {} })
const RUN = Date.now().toString().slice(-5)
const A = 'ZZ리셋A' + RUN, B = 'ZZ리셋B' + RUN, B2 = 'ZZ리셋B고침' + RUN
const root = path.join(os.homedir(), 'Desktop', `_시험 리셋${RUN}`)
const state = path.join(os.tmpdir(), `reset-${RUN}.json`)
const mk = () => { const e = new SyncEngine({ uid: cfg.uid, watchDir: root, statePath: state, api: api(), onNewFolder: () => true, onFileStatus: () => {}, onError: () => {}, onFolderDeletionRequested: () => {} }); e.downloadRemoteAsset = async () => ({ skipped: true }); return e }
const all = async () => ((await api().getProjectsByUid()).projects || [])
const 살아있는 = async name => (await all()).find(p => p.name === name && !p.deletedAt)
const 휴지통 = async name => (await all()).find(p => p.name === name && p.deletedAt)
const 사진수 = async pid => ((await api().getAssetsByProject(pid)).assets || []).filter(a => !a.deletedAt).length
const wait = async (fn, ms = 150000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(3000) } return false }
const 사진 = async (p, seed) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, await sharp({ create: { width: 300 + seed, height: 200, channels: 3, background: { r: seed * 9 % 255, g: 120, b: 60 } } }).jpeg().toBuffer()) }
const 만든것 = []

;(async () => {
  await 사진(path.join(root, 'AD', A, '가.jpg'), 3)
  await 사진(path.join(root, 'AD', B, '나.jpg'), 7)
  let e = mk(); await e.start()
  ok('프로젝트 둘이 올라갔다', await wait(async () => (await 살아있는(A)) && (await 살아있는(B))))
  const pa = await 살아있는(A), pb = await 살아있는(B)
  if (!pa || !pb) { console.log('중단'); process.exit(1) }
  만든것.push(pa.id, pb.id)
  try { await e.stop?.() } catch {}

  // ② 사람이 폴더 이름을 바꾼다
  fs.renameSync(path.join(root, 'AD', B), path.join(root, 'AD', B2))
  console.log(`  · 폴더 이름을 ${B} → ${B2} 로 바꿨다`)

  // ③ 웹을 폴더 기준으로 다시 연결
  e = mk()
  /* 시험 계정에 옛 시험 찌꺼기가 남아 있어 안전장치가 먼저 걸린다 — 그건 아래 ④ 에서 따로 확인한다 */
  const r = await e.폴더기준으로다시({ 강행: true })
  console.log('  · 결과:', JSON.stringify({ 막힘: r.막힘, 프로젝트: r.프로젝트, 사진: r.사진, 웹: r.웹프로젝트, 폴더: r.폴더프로젝트 }))
  ok('강행하면 진행된다', !r.막힘)
  ok('웹 프로젝트를 휴지통으로 보냈다', (r.프로젝트 || 0) >= 2, `${r.프로젝트}개`)
  await e.start()

  ok('폴더에 있는 A 가 되살아났다', await wait(async () => { const p = await 살아있는(A); return p && (await 사진수(p.id)) === 1 }, 150000))
  ok('바뀐 이름 B고침 이 새로 생겼다', await wait(async () => { const p = await 살아있는(B2); return p && (await 사진수(p.id)) === 1 }, 150000))
  const 옛B = await 살아있는(B)
  ok('폴더에 없는 옛 이름 B 는 살아있지 않다', !옛B, 옛B ? '아직 있다' : '')
  ok('옛 이름 B 는 휴지통에 있다 (되돌릴 수 있다)', !!(await 휴지통(B)))
  const pb2 = await 살아있는(B2); if (pb2) 만든것.push(pb2.id)
  try { await e.stop?.() } catch {}

  // ④ 폴더를 비우고 다시 부르면 막아야 한다
  fs.rmSync(path.join(root, 'AD'), { recursive: true, force: true })
  const e2 = mk()
  const r2 = await e2.폴더기준으로다시({})
  ok('폴더가 비면 막는다', !!r2.막힘, r2.막힘 ? `폴더 ${r2.폴더프로젝트} · 웹 ${r2.웹프로젝트}` : '안 막았다')

  for (const id of 만든것) await api().softDeleteProject(id).catch(() => {})
  fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(state, { force: true })
  console.log(fail ? `\n${fail}가지 실패` : '\n전부 통과')
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('터짐', e); process.exit(1) })

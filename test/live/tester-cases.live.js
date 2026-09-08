/* 테스터(김영훈)가 2026-09-08 에 겪은 경우들을 **실제 서버·실제 폴더**로 재현한다.
   시험 계정(애플 릴레이)만 쓴다. 대표님 폴더는 건드리지 않는다.
   돌리는 법: node test/live/tester-cases.live.js

   ① 같은 이름 폴더를 다시 만들면 — 휴지통에 든 프로젝트가 되살아나고 사진도 돌아온다
      (예전엔 휴지통 프로젝트에 조용히 올라가 웹에서 안 보였다)
   ② 중복 정리에서 프로젝트를 통째로 비우는 삭제는 서버가 거부한다
      (예전엔 YEEL 에서 마지막 영상이 지워져 프로젝트가 비었다)
   ③ 같은 파일을 폴더 두 곳에 두면 — 각 프로젝트가 제 사진을 갖는다 (끌어오지 않는다)
      (예전엔 나중 폴더가 앞 폴더의 사진을 가져가 앞 프로젝트가 비었다) */
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
const RUN = new Date().toISOString().slice(11, 19).replace(/:/g, '')
const PREFIX = `ZZ_테스터${RUN}_`

let fail = 0
const ok = (t, c, x) => { console.log((c ? '  ✅ ' : '  ❌ ') + t + (x ? '  ' + x : '')); if (!c) fail++ }
const head = t => console.log(`\n${'━'.repeat(60)}\n${t}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const api = () => new ApiClient({ idToken: cfg.idToken, refreshToken: cfg.refreshToken, onTokenRefreshed: () => {} })
async function waitFor(fn, ms = 120000) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(2500) } return false }
const allAssets = async (pid) => ((await api().getAssetsByProject(pid)).assets || [])
const liveAssets = async (pid) => (await allAssets(pid)).filter(a => !a.deletedAt)
const findProj = async (name) => ((await api().getProjectsByUid()).projects || []).find(x => x.name === name && !x.deletedAt)
const anyProj = async (name) => ((await api().getProjectsByUid()).projects || []).find(x => x.name === name)
async function jpeg(file, seed) {
  const buf = await sharp({ create: { width: 360 + seed * 7, height: 240, channels: 3, background: { r: (seed * 37) % 255, g: (seed * 91) % 255, b: (seed * 53) % 255 } } }).jpeg({ quality: 80 }).toBuffer()
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); return buf
}
function makeEngine(watchDir, statePath) {
  const e = new SyncEngine({ uid: cfg.uid, watchDir, statePath, api: api(),
    onNewFolder: () => true, onFileStatus: () => {}, onError: () => {}, onFolderDeletionRequested: () => {} })
  const orig = e.downloadRemoteAsset.bind(e)
  e.downloadRemoteAsset = async (asset) => {
    const p = await api().getProject(asset.projectId).catch(() => null)
    if (!p || !(p.name || '').startsWith('ZZ_')) return { skipped: true, reason: '시험 아님' }
    return orig(asset)
  }
  return e
}
const 만든것 = []

;(async () => {
  const root = path.join(os.homedir(), 'Desktop', `_시험 테스터${RUN}`)
  const state = path.join(os.tmpdir(), `tester-${RUN}-state.json`)
  fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(state, { force: true })

  /* ─────────────── ① 같은 이름 폴더를 다시 만든다 ─────────────── */
  head('① 프로젝트를 휴지통에 넣은 뒤, 같은 이름 폴더를 다시 만들어 동기화한다')
  const P1 = PREFIX + '되살림'
  await jpeg(path.join(root, 'AD', P1, '하나.jpg'), 1)
  let e = makeEngine(root, state); await e.start()
  ok('사진이 올라갔다', await waitFor(async () => { const p = await findProj(P1); return p && (await liveAssets(p.id)).length === 1 }))
  const p1 = await findProj(P1); if (!p1) { console.log('중단'); process.exit(1) } 만든것.push(p1.id)
  try { e.stop?.() } catch {}
  await api().softDeleteProject(p1.id)
  ok('웹에서 휴지통에 넣었다 (프로젝트+사진 숨김)', await waitFor(async () => { const p = await anyProj(P1); return p && !!p.deletedAt }, 30000))
  fs.rmSync(state, { force: true })                            // 새 설치와 같은 상황
  fs.rmSync(path.join(root, 'AD', P1), { recursive: true, force: true })
  await jpeg(path.join(root, 'AD', P1, '하나.jpg'), 1)         // 같은 이름 폴더, 같은 파일
  e = makeEngine(root, state); await e.start()
  const restored = await waitFor(async () => { const p = await findProj(P1); return p && (await liveAssets(p.id)).length === 1 }, 90000)
  const p1b = await anyProj(P1)
  ok('휴지통에 있던 프로젝트가 되살아났다 (새로 만든 게 아니다)', restored && p1b && p1b.id === p1.id, p1b ? `id 같음=${p1b.id === p1.id}` : '')
  ok('사진도 휴지통에서 돌아왔다 (살아있는 1장, 전체 1장)', restored && (await allAssets(p1.id)).length === 1, `${(await allAssets(p1.id)).length}장`)
  try { e.stop?.() } catch {}

  /* ─────────────── ② 마지막 한 장 삭제는 서버가 거부한다 ─────────────── */
  head('② 중복 정리처럼 사진을 휴지통에 넣을 때 — 프로젝트가 통째로 비면 서버가 막는다')
  const [only] = await liveAssets(p1.id)
  const r1 = await api().trashAssets([only.id])
  ok('마지막 한 장은 지우지 않았다 (보호됨 1)', r1 && r1.moved === 0 && r1.보호됨 === 1, JSON.stringify({ moved: r1?.moved, 보호됨: r1?.보호됨 }))
  ok('사진이 그대로 살아 있다', (await liveAssets(p1.id)).length === 1)
  await jpeg(path.join(root, 'AD', P1, '둘.jpg'), 2)
  e = makeEngine(root, state); await e.start()
  ok('둘째 사진이 올라갔다', await waitFor(async () => (await liveAssets(p1.id)).length === 2))
  try { e.stop?.() } catch {}
  const r2 = await api().trashAssets([only.id])
  ok('다른 사진이 남아 있으면 지운다 (moved 1)', r2 && r2.moved === 1, JSON.stringify({ moved: r2?.moved, 보호됨: r2?.보호됨 }))
  ok('살아있는 사진 1장', (await liveAssets(p1.id)).length === 1)

  /* ─────────────── ③ 같은 파일을 폴더 두 곳에 ─────────────── */
  head('③ 같은 파일을 폴더 두 곳에 둔다 — 각 프로젝트가 제 사진을 갖는다')
  const PA = PREFIX + 'A', PB = PREFIX + 'B'
  const same = await jpeg(path.join(root, 'AD', PA, '같은사진.jpg'), 9)
  fs.mkdirSync(path.join(root, 'AD', PB), { recursive: true }); fs.writeFileSync(path.join(root, 'AD', PB, '같은사진.jpg'), same)
  e = makeEngine(root, state); await e.start()
  const both = await waitFor(async () => {
    const a = await findProj(PA), b = await findProj(PB)
    return a && b && (await liveAssets(a.id)).length === 1 && (await liveAssets(b.id)).length === 1
  }, 150000)
  const pa = await findProj(PA), pb = await findProj(PB)
  if (pa) 만든것.push(pa.id); if (pb) 만든것.push(pb.id)
  ok('두 프로젝트 모두 사진 1장씩 보인다 (앞 폴더에서 사라지지 않았다)', both, `${pa ? (await liveAssets(pa.id)).length : '?'}장 · ${pb ? (await liveAssets(pb.id)).length : '?'}장`)
  if (pa && pb) {
    const ia = (await liveAssets(pa.id))[0]?.id, ib = (await liveAssets(pb.id))[0]?.id
    ok('서로 다른 사진 기록이다 (한 벌을 끌어다 쓴 게 아니다)', ia && ib && ia !== ib)
  }
  try { e.stop?.() } catch {}

  head('④ 뒷정리')
  for (const id of 만든것) await api().softDeleteProject(id).catch(() => {})
  fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(state, { force: true })
  console.log(`\n${'━'.repeat(60)}\n` + (fail ? `${fail}가지 실패` : '전부 통과'))
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('시험 자체가 터졌다:', e); process.exit(1) })

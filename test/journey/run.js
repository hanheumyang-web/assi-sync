#!/usr/bin/env node
/* 사용자 흉내내기 — 실행: npm run test:journey [동작수] [씨앗]
 *
 * 왜 이렇게 짰나
 * ─────────────
 * 2026-09-07~08 에 사고가 여럿 났는데 공통점이 있었다.
 * **생각해서 짜둔 시험은 전부 통과했다.** 터진 건 생각 못 한 조합이었다.
 *
 * 그래서 경우를 다 적어두려 하지 않는다. 사용자가 실제로 하는 행동을
 * 무작위로 섞어 돌리면서, **매 동작 뒤에 "절대 깨지면 안 되는 규칙" 을 전부 확인한다.**
 * 어떤 조합에서 깨지든 여기서 걸린다.
 *
 * 규칙은 invariants.js, 행동은 actions.js 에 있다.
 *
 * 씨앗(seed)을 적어두면 같은 순서가 그대로 재현된다 —
 * 깨졌을 때 "그때 그 상황" 을 다시 만들 수 있어야 고칠 수 있다.
 *
 * ⚠️ 실제 서버에 붙는다. 테스트 계정으로만 돌린다.
 *    시험이 만드는 것은 전부 ZZ여정_ 로 시작한다. 그 밖의 것은 건드리지 않는다.
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const DESK = path.join(__dirname, '..', '..')
const ApiMod = require(path.join(DESK, 'lib', 'api-client.js'))
const ApiClient = ApiMod.ApiClient || ApiMod
const EngMod = require(path.join(DESK, 'lib', 'sync-engine.js'))
const SyncEngine = EngMod.SyncEngine || EngMod
const sharp = require(path.join(DESK, 'node_modules', 'sharp'))
const { ACTIONS } = require('./actions')
const { checkAll } = require('./invariants')

const STEPS = Number(process.argv[2]) || 20
const SEED = Number(process.argv[3]) || Math.floor(Math.random() * 1e9)
const PREFIX = 'ZZ여정_'
const ACCOUNT = process.env.POFOL_TEST_ACCOUNT || 'assi-sync'   // 테스트 계정 (애플 릴레이)

/* 씨앗을 넣으면 같은 순서가 나오는 난수 */
function makeRng(seed) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const cfgPath = path.join(os.homedir(), 'Library/Application Support', ACCOUNT, 'config.json')

function loadCfg() {
  if (!fs.existsSync(cfgPath)) {
    console.error(`\n로그인 정보를 못 찾았다: ${cfgPath}`)
    console.error('싱크앱에 테스트 계정으로 로그인한 뒤 다시 돌려라.\n')
    process.exit(2)
  }
  return JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
}

;(async () => {
  const cfg = loadCfg()
  const mkApi = () => new ApiClient({ idToken: cfg.idToken, refreshToken: cfg.refreshToken, onTokenRefreshed: () => {} })

  const root = path.join(os.homedir(), 'Desktop', '_여정시험')
  fs.rmSync(root, { recursive: true, force: true })
  fs.mkdirSync(root, { recursive: true })
  const statePath = path.join(os.tmpdir(), 'journey-state.json')
  fs.rmSync(statePath, { force: true })

  const rng = makeRng(SEED)
  let seedCounter = SEED
  const events = { asks: [] }

  let engine = null
  function newEngine() {
    const e = new SyncEngine({
      uid: cfg.uid, watchDir: root, statePath, api: mkApi(),
      onNewFolder: () => true,
      onFileStatus: () => {},
      onError: () => {},
      onFolderDeletionRequested: i => events.asks.push(i),
    })
    /* 이 시험과 무관한 계정의 다른 자료가 시험 폴더로 딸려오지 않게 */
    const orig = e.downloadRemoteAsset.bind(e)
    e.downloadRemoteAsset = async (asset) => {
      const p = await mkApi().getProject(asset.projectId).catch(() => null)
      if (!p || !(p.name || '').startsWith(PREFIX)) return { skipped: true, reason: '시험 아님' }
      return orig(asset)
    }
    return e
  }

  const expected = {
    files: new Set(),            // 지금 디스크에 있어야 하는 사진들 (감시폴더 기준 상대경로)
    projects: new Set(),         // 웹에 살아 있어야 하는 프로젝트 이름
    folders: new Map(),          // 프로젝트 이름 → 지금 폴더 위치
    assetCounts: new Map(),      // 프로젝트 이름 → 웹에 있어야 할 최대 사진 수
    deletedFolders: new Set(),   // 내가 지운 폴더 (여기 대해선 물어봐도 정상)
  }

  const w = {
    root, sharp, rng, expected, prefix: PREFIX,
    seedNext: () => ++seedCounter,
    pick: arr => arr[Math.floor(rng() * arr.length)],
    pickEntry: map => {
      const arr = [...map.entries()]
      return arr[Math.floor(rng() * arr.length)]
    },
    api: mkApi,
    engine: () => engine,
    web: async () => {
      const { projects } = await mkApi().getProjectsByUid()
      const mine = (projects || []).filter(p => (p.name || '').startsWith(PREFIX))
      const assetsByProject = new Map()
      for (const p of mine) {
        const { assets } = await mkApi().getAssetsByProject(p.id).catch(() => ({ assets: [] }))
        assetsByProject.set(p.id, assets || [])
      }
      return { projects: mine, assetsByProject }
    },
    restartEngine: async () => {
      try { engine?.stop?.() } catch {}
      await sleep(600)
      engine = newEngine()
      await engine.start()
      await sleep(1500)
    },
  }

  console.log(`\n사용자 흉내내기 — ${STEPS}동작 · 씨앗 ${SEED}`)
  console.log(`시험 폴더: ${root}`)
  console.log(`계정: ${cfg.email}  (만드는 것은 전부 ${PREFIX} 로 시작한다)\n`)

  engine = newEngine()
  await engine.start()
  await sleep(1500)

  let broke = null
  const history = []

  for (let step = 1; step <= STEPS; step++) {
    /* 지금 할 수 있는 행동 중에서 가중치대로 하나 고른다 */
    const usable = ACTIONS.filter(a => a.canRun(w))
    const total = usable.reduce((s, a) => s + a.weight, 0)
    let r = rng() * total
    const action = usable.find(a => (r -= a.weight) <= 0) || usable[0]

    let what = null
    try { what = await action.run(w) } catch (e) { what = `(터짐: ${e.message})` }
    if (what === null) { step--; continue }          // 할 수 없는 상황이면 다시 고른다

    events.asks.length = 0                            // 이 동작 동안의 질문만 본다
    await sleep(3500)                                 // 앱이 반응할 시간

    const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { syncedFiles: {} }
    const web = await w.web()
    const broken = checkAll({ root, state, web, expected, events })

    const line = `${String(step).padStart(2)}. ${action.name} — ${what}`
    history.push(line)
    if (broken.length) {
      console.log(`❌ ${line}`)
      broke = { step, action: action.name, what, broken }
      break
    }
    console.log(`✅ ${line}`)
  }

  /* ── 뒷정리 ── */
  console.log('\n뒷정리...')
  try { engine?.stop?.() } catch {}
  try {
    const { projects } = await mkApi().getProjectsByUid()
    for (const p of (projects || []).filter(x => (x.name || '').startsWith(PREFIX))) {
      await mkApi().deleteProject(p.id).catch(() => {})
    }
  } catch {}
  if (!broke) fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(statePath, { force: true })

  console.log('\n' + '━'.repeat(64))
  if (!broke) {
    console.log(`${STEPS}동작 전부 통과 — 규칙이 하나도 안 깨졌다 (씨앗 ${SEED})`)
    process.exit(0)
  }

  console.log(`${broke.step}번째 동작에서 규칙이 깨졌다\n`)
  console.log(`  한 일: ${broke.action} — ${broke.what}\n`)
  for (const b of broke.broken) {
    console.log(`  ❌ ${b.name}`)
    console.log(`     ${b.detail}`)
    console.log(`     왜 중요한가: ${b.why}\n`)
  }
  console.log('  같은 상황을 다시 만들려면:')
  console.log(`     npm run test:journey ${STEPS} ${SEED}\n`)
  console.log(`  현장은 그대로 뒀다: ${root}`)
  process.exit(1)
})().catch(e => { console.error('\n시험 자체가 터졌다:', e); process.exit(3) })

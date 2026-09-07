/* 싱크앱이 실제로 겪는 흐름들 — 실행: node test/sync-cases.test.js */
const fs = require('fs'), path = require('path'), os = require('os')
const SHIPPED = require('path').join(__dirname,'..','lib','sync-engine.js')
const M = require(SHIPPED); const Engine = M.SyncEngine || M
const BASE = __dirname
/* 테스트용 파일은 여기서 만든다 — 실제 사진을 저장소에 넣지 않는다.
   크기가 제각각이어야 '크기로 신원을 확인' 하는 부분이 의미가 있다. */
const ORIG = path.join(os.tmpdir(), 'pofol-test-fixtures')
if (!fs.existsSync(ORIG)) fs.mkdirSync(ORIG, { recursive: true })
{
  const jpegHead = Buffer.from([0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46])
  const spec = [['day4-57.jpg', 278663], ['day4-59.jpg', 675486], ['1.png', 73618], ['2.png', 70425]]
  for (const [name, size] of spec) {
    const p = path.join(ORIG, name)
    if (fs.existsSync(p) && fs.statSync(p).size === size) continue
    const buf = Buffer.alloc(size)
    jpegHead.copy(buf)
    for (let i = jpegHead.length; i < size; i++) buf[i] = (i * 31 + name.length) & 0xFF
    fs.writeFileSync(p, buf)
  }
}

let fail = 0, caseNo = 0
const ok = (n, c, extra) => { console.log((c ? '  ✅ ' : '  ❌ ') + n + (extra ? '  ' + extra : '')); if (!c) fail++ }
const head = t => { caseNo++; console.log(`\n${'━'.repeat(64)}\n${caseNo}. ${t}`) }

function fresh() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pofol-'))
  const proj = path.join(root, 'FASHION', 'image6')
  fs.mkdirSync(proj, { recursive: true })
  for (const f of fs.readdirSync(ORIG)) fs.copyFileSync(path.join(ORIG, f), path.join(proj, f))
  return { root, proj, state: path.join(root, '.state.json') }
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const ls = p => fs.existsSync(p) ? fs.readdirSync(p).filter(n => n !== '.DS_Store').sort() : []
const sizes = p => Object.fromEntries(ls(p).map(f => [f, fs.statSync(path.join(p, f)).size]))
const NAMES = fs.readdirSync(ORIG)
const PID = 'proj_image6'

// 서버 대역 — 실제 서버 응답 모양 그대로
function makeApi(root, opts = {}) {
  const st = { deleted: false, downloadable: [], ...opts }
  st.api = {
    getProjectsByUid: async () => ({ projects: [{ id: PID, name: 'image6', category: 'FASHION', deletedAt: st.deleted ? new Date().toISOString() : null }] }),
    getAssetsByProject: async () => ({
      assets: NAMES.map((f, i) => ({ id: 'asset' + i, fileName: f, storagePath: 'u/' + f, fileSize: fs.statSync(path.join(ORIG, f)).size }))
    }),
    listAssetsSince: async () => ({
      assets: st.downloadable, nextSince: null, nextCursor: null, hasMore: false, mode: 'inc',
      deletedProjects: st.deleted ? [{ id: PID, name: 'image6', deletedAt: new Date().toISOString() }] : []
    }),
    updateProject: async () => ({}), deleteFile: async () => ({}),
  }
  return st
}
function engine(root, statePath, api, hooks = {}) {
  return new Engine({ uid: 'u1', watchDir: root, statePath, api, ...hooks })
}

;(async () => {
console.log('코드:', require(require('path').join(__dirname,'..','package.json')).version, '(수정본)')
console.log('실제 사진:', NAMES.join(', '))

// ────────────────────────────────────────────────────────────
head('새 폴더를 처음 연결한다 — 로컬 파일이 사라지거나 바뀌면 안 된다')
{
  const { root, proj, state } = fresh()
  const before = sizes(proj)
  const s = makeApi(root)
  const e = engine(root, state, s.api)
  await e.syncStateWithServer()
  ok('사진 4장 그대로 있다', ls(proj).length === NAMES.length)
  ok('내용도 안 바뀌었다', JSON.stringify(sizes(proj)) === JSON.stringify(before))
  const rec = Object.values(e.state.syncedFiles)
  ok('전부 기록됐다', rec.length === NAMES.length)
  ok('기록에 파일 크기가 들어 있다 (안전장치의 근거)', rec.every(r => r.fileSize > 0))
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('평소엔 웹 자료가 로컬로 내려오지 않는다 (로컬이 기준)')
{
  const { root, proj, state } = fresh()
  const s = makeApi(root)
  // 웹에만 있는 파일 하나가 있다고 치자
  s.downloadable = [{ id: 'web1', fileName: '웹에만있는사진.jpg', projectId: PID, projectName: 'image6', category: 'FASHION', url: 'https://example.invalid/x.jpg', storagePath: 'u/x', fileSize: 100 }]
  const e = engine(root, state, s.api)
  await e.syncStateWithServer()
  e.prepareDownloadEngine()            // 앱이 평소에 하는 것
  await new Promise(r => setTimeout(r, 600))
  ok('웹에만 있던 파일이 내려오지 않았다', !ls(proj).includes('웹에만있는사진.jpg'))
  ok('자동 폴링 타이머가 안 돈다', !e.downloadTimer && !e._downloadInterval)
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('테스터 상황 — 폴더를 지웠다 다시 만든 뒤 웹에서 그 프로젝트가 삭제된다')
{
  const { root, proj, state } = fresh()
  const s = makeApi(root)
  const e = engine(root, state, s.api)
  await e.syncStateWithServer()

  fs.rmSync(proj, { recursive: true, force: true })
  fs.mkdirSync(proj, { recursive: true })
  for (const f of NAMES) fs.writeFileSync(path.join(proj, f), '내가 새로 정리해 넣은 사진 ' + f)
  const mine = sizes(proj)

  s.deleted = true
  await e.removeDeletedProjectLocally({ id: PID, name: 'image6', deletedAt: new Date().toISOString() })
  ok('내 새 파일 4장이 그대로 있다', ls(proj).length === NAMES.length)
  ok('내용도 안 바뀌었다', JSON.stringify(sizes(proj)) === JSON.stringify(mine))
  ok('휴지통이 만들어지지 않았다', !fs.existsSync(path.join(root, '_Trash')))
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('진짜 우리가 올린 파일일 때는 휴지통으로 간다 → 웹에서 복구하면 제자리로')
{
  const { root, proj, state } = fresh()
  const before = sizes(proj)
  const s = makeApi(root)
  const e = engine(root, state, s.api)
  await e.syncStateWithServer()
  s.deleted = true
  await e.removeDeletedProjectLocally({ id: PID, name: 'image6', deletedAt: new Date().toISOString() })
  const td = ls(path.join(root, '_Trash'))[0]
  ok('원래 자리가 비었다', ls(proj).length === 0)
  ok('휴지통에 4장이 들어갔다', td && ls(path.join(root, '_Trash', td)).filter(n => n !== '.meta.json').length === NAMES.length)

  e.restoreProjectFromLocalTrash(path.join(root, '_Trash', td))
  ok('복구하면 4장이 제자리로 돌아온다', ls(proj).length === NAMES.length)
  ok('사진이 손상 없이 그대로다', JSON.stringify(sizes(proj)) === JSON.stringify(before))
  ok('빈 휴지통 폴더는 사라졌다', !fs.existsSync(path.join(root, '_Trash', td)))
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('복구할 자리에 사용자가 새 파일을 넣어뒀다면 — 덮어쓰면 안 된다')
{
  const { root, proj, state } = fresh()
  const s = makeApi(root)
  const e = engine(root, state, s.api)
  await e.syncStateWithServer()
  s.deleted = true
  await e.removeDeletedProjectLocally({ id: PID, name: 'image6', deletedAt: new Date().toISOString() })
  const td = ls(path.join(root, '_Trash'))[0]
  fs.mkdirSync(proj, { recursive: true })
  fs.writeFileSync(path.join(proj, NAMES[0]), '그 사이에 넣은 소중한 새 파일')
  e.restoreProjectFromLocalTrash(path.join(root, '_Trash', td))
  ok('사용자의 새 파일이 살아 있다', fs.readFileSync(path.join(proj, NAMES[0]), 'utf8') === '그 사이에 넣은 소중한 새 파일')
  ok('옛 원본은 번호를 달고 옆에 돌아왔다', ls(proj).some(n => /_2\./.test(n)))
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('앱이 꺼진 사이 사용자가 로컬에서 지웠다 — 되살리지 말고 물어봐야 한다')
{
  const { root, proj, state } = fresh()
  const s = makeApi(root)
  const e = engine(root, state, s.api)
  await e.syncStateWithServer()
  fs.unlinkSync(path.join(proj, NAMES[0]))   // 한 장만 지움
  let asked = null
  e.onFolderDeletionRequested = i => { asked = i }
  const r = e.reconcileLocalDeletions()
  await sleep(80)   // 묻기 전에 서버에 아직 있는지 확인하므로 한 박자 늦다
  ok('사라진 1장을 알아챘다', r.missing === 1)
  ok('사람에게 물어봤다', !!asked, asked ? `(${asked.folderName} ${asked.fileCount}개)` : '')
  ok('다시 안 받도록 표시했다', !!e.state.locallyRemoved && Object.keys(e.state.locallyRemoved).length === 1)
  ok('나머지 3장은 그대로다', ls(proj).length === NAMES.length - 1)
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('외장하드를 안 꽂았다 — 전부 안 보일 때는 아무 판단도 하면 안 된다')
{
  const { root, proj, state } = fresh()
  const s = makeApi(root)
  const e = engine(root, state, s.api)
  await e.syncStateWithServer()
  for (const f of NAMES) fs.unlinkSync(path.join(proj, f))  // 전부 사라짐
  let asked = false
  e.onFolderDeletionRequested = () => { asked = true }
  const r = e.reconcileLocalDeletions()
  ok('폴더를 못 읽는 상황으로 보고 건너뛴다', r.skipped === 'looks-like-unmounted', `(${r.missing}/${NAMES.length})`)
  ok('사람을 귀찮게 하지 않는다', !asked)
  ok("'치웠다' 표시를 남기지 않았다 (나중에 돌아오면 받아야 하니까)", !e.state.locallyRemoved || !Object.keys(e.state.locallyRemoved).length)
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('웹→로컬 버튼을 눌렀을 때는 치웠던 표시가 풀려야 한다')
{
  const { root, proj, state } = fresh()
  const s = makeApi(root)
  const e = engine(root, state, s.api)
  await e.syncStateWithServer()
  fs.unlinkSync(path.join(proj, NAMES[0]))
  e.reconcileLocalDeletions()
  const marked = Object.keys(e.state.locallyRemoved || {}).length
  e.restoreLocallyRemoved()
  ok('버튼 누르기 전엔 표시가 있었다', marked === 1)
  ok('누르면 표시가 풀린다 (안 그러면 지웠던 것만 안 내려온다)', !Object.keys(e.state.locallyRemoved || {}).length)
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('중복 파일 정리 — 휴지통으로 보내고 되돌리기')
{
  const { root, proj, state } = fresh()
  const s = makeApi(root)
  const e = engine(root, state, s.api)
  await e.syncStateWithServer()
  const before = sizes(proj)
  const target = Object.entries(e.state.syncedFiles).find(([p]) => p.endsWith(NAMES[0]))[1].assetId
  const r1 = e.trashAssetFiles([target])
  ok('1장이 휴지통으로 갔다', r1.moved === 1 && ls(proj).length === NAMES.length - 1)
  const r2 = e.restoreAssetFiles([target])
  ok('되돌리면 제자리로 온다', r2.restored === 1 && ls(proj).length === NAMES.length)
  ok('사진이 그대로다', JSON.stringify(sizes(proj)) === JSON.stringify(before))
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('앱이 자기가 옮겨놓고 "사용자가 지웠다" 고 오해하면 안 된다')
{
  const { root, proj, state } = fresh()
  const s = makeApi(root)
  const e = engine(root, state, s.api)
  await e.syncStateWithServer()
  s.deleted = true
  await e.removeDeletedProjectLocally({ id: PID, name: 'image6', deletedAt: new Date().toISOString() })
  const rel = 'FASHION/image6/' + NAMES[0]
  ok('방금 자기가 옮긴 자리라고 표시해 뒀다', e.isSelfMoved(rel) === true)
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('같은 삭제 신호가 연달아 와도 휴지통이 여러 개 생기면 안 된다')
{
  const { root, proj, state } = fresh()
  const s = makeApi(root)
  const e = engine(root, state, s.api)
  await e.syncStateWithServer()
  s.deleted = true
  const info = { id: PID, name: 'image6', deletedAt: new Date().toISOString() }
  await e.removeDeletedProjectLocally(info)
  await e.removeDeletedProjectLocally(info)
  await e.removeDeletedProjectLocally(info)
  ok('휴지통 폴더는 하나뿐이다', ls(path.join(root, '_Trash')).length === 1, `(${ls(path.join(root, '_Trash')).join(', ')})`)
  fs.rmSync(root, { recursive: true, force: true })
}

// ────────────────────────────────────────────────────────────
head('옛 버전이 남긴 기록 (파일 크기 없음) — 확인할 근거가 없으면 손대지 않는다')
{
  const { root, proj, state } = fresh()
  const s = makeApi(root)
  const e = engine(root, state, s.api)
  await e.syncStateWithServer()
  for (const k of Object.keys(e.state.syncedFiles)) delete e.state.syncedFiles[k].fileSize  // 옛 기록 흉내
  s.deleted = true
  await e.removeDeletedProjectLocally({ id: PID, name: 'image6', deletedAt: new Date().toISOString() })
  ok('사진 4장이 그대로 있다', ls(proj).length === NAMES.length)
  ok('휴지통이 안 만들어졌다', !fs.existsSync(path.join(root, '_Trash')))
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('\n' + '━'.repeat(64))
console.log(fail ? `실패 ${fail}건` : `${caseNo}가지 경우 전부 통과`)
process.exit(fail ? 1 : 0)
})().catch(e => { console.error('터짐:', e); process.exit(1) })

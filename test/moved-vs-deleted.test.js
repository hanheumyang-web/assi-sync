/* 대표님이 실제로 겪은 상황 재현 — 프로젝트가 개인작업/ → Instagram/ 으로 옮겨졌을 때. */
const fs = require('fs'), path = require('path'), os = require('os')
const M = require(require('path').join(__dirname,'..','lib','sync-engine.js'))
const Engine = M.SyncEngine || M
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
const NAMES = fs.readdirSync(ORIG).filter(n => !n.startsWith('.'))
let fail = 0
const ok = (n, c, x) => { console.log((c ? '  ✅ ' : '  ❌ ') + n + (x ? '  ' + x : '')); if (!c) fail++ }
const ls = p => fs.existsSync(p) ? fs.readdirSync(p).filter(n => n !== '.DS_Store').sort() : []

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moved-'))
  const old = path.join(root, '개인작업', '아저씨는 따봉이야')
  fs.mkdirSync(old, { recursive: true })
  for (const f of NAMES) fs.copyFileSync(path.join(ORIG, f), path.join(old, f))
  const state = path.join(root, '.state.json')
  const e = new Engine({ uid: 'u1', watchDir: root, statePath: state, api: {} })
  // 앱이 이미 이 파일들을 알고 있는 상태로 만든다
  for (const f of NAMES) {
    e.state.syncedFiles[`개인작업/아저씨는 따봉이야/${f}`] = {
      assetId: 'a_' + f, projectId: 'P1',
      fileSize: fs.statSync(path.join(ORIG, f)).size,
    }
  }
  e.saveState()
  return { root, old, e, state }
}

console.log(`실제 사진 ${NAMES.length}장으로 재현한다\n`)

console.log('① 카테고리가 바뀌어 폴더째 옮겨졌다 (개인작업 → Instagram)')
{
  const { root, old, e } = setup()
  const neu = path.join(root, 'Instagram', '아저씨는 따봉이야')
  fs.mkdirSync(path.dirname(neu), { recursive: true })
  fs.renameSync(old, neu)
  fs.rmSync(path.join(root, '개인작업'), { recursive: true, force: true })

  let asked = null
  e.onFolderDeletionRequested = i => { asked = i }
  const r = e.reconcileLocalDeletions()

  ok('"웹에서도 지울까요?" 를 띄우지 않는다', !asked, asked ? `(${asked.folderName} ${asked.fileCount}개)` : '')
  ok('옮겨진 것으로 알아봤다', r.moved === NAMES.length, `(${r.moved}개)`)
  ok("'치웠다' 표시를 남기지 않았다", !Object.keys(e.state.locallyRemoved || {}).length)
  ok('사진 19장 그대로 있다', ls(neu).length === NAMES.length)
  const keys = Object.keys(e.state.syncedFiles)
  ok('기록이 새 자리로 옮겨졌다', keys.every(k => k.startsWith('Instagram/')) && keys.length === NAMES.length)
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('\n② 진짜로 지운 경우는 여전히 물어봐야 한다')
{
  const { root, old, e } = setup()
  fs.unlinkSync(path.join(old, NAMES[0]))
  fs.unlinkSync(path.join(old, NAMES[1]))
  let asked = null
  e.onFolderDeletionRequested = i => { asked = i }
  const r = e.reconcileLocalDeletions()
  ok('2장이 지워진 걸 알아챘다', r.missing === 2, `(${r.missing}개)`)
  ok('사람에게 물어봤다', !!asked, asked ? `(${asked.folderName} ${asked.fileCount}개)` : '')
  ok('나머지 17장은 건드리지 않았다', ls(old).length === NAMES.length - 2)
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('\n③ 옮긴 것과 지운 것이 섞여 있을 때 — 지운 것만 물어본다')
{
  const { root, old, e } = setup()
  const neu = path.join(root, 'Instagram', '아저씨는 따봉이야')
  fs.mkdirSync(neu, { recursive: true })
  for (const f of NAMES.slice(2)) fs.renameSync(path.join(old, f), path.join(neu, f))
  fs.unlinkSync(path.join(old, NAMES[0]))   // 하나는 진짜 삭제
  fs.unlinkSync(path.join(old, NAMES[1]))   // 하나 더 진짜 삭제
  let asked = null
  e.onFolderDeletionRequested = i => { asked = i }
  const r = e.reconcileLocalDeletions()
  ok('옮긴 17장은 옮긴 것으로', r.moved === NAMES.length - 2, `(${r.moved}개)`)
  ok('지운 2장만 지운 것으로', r.missing === 2, `(${r.missing}개)`)
  ok('물어본 개수도 2개다', asked && asked.fileCount === 2, asked ? `(${asked.fileCount}개)` : '')
  fs.rmSync(root, { recursive: true, force: true })
}

console.log("\n④ 이미 잘못 남은 '치웠다' 표시는 앱이 스스로 걷어낸다")
{
  const { root, old, e } = setup()
  // 옛 버전이 잘못 남긴 표시를 흉내낸다 — 파일은 멀쩡히 있는데 표시만 있는 상태
  for (const f of NAMES) e.markLocallyRemoved('a_' + f, `개인작업/아저씨는 따봉이야/${f}`)
  const before = Object.keys(e.state.locallyRemoved).length
  const cleared = e.cleanupStaleRemovalMarks()
  ok(`잘못된 표시 ${before}건을 걷어냈다`, cleared === NAMES.length, `(${cleared}건)`)
  ok('표시가 다 사라졌다', !Object.keys(e.state.locallyRemoved || {}).length)
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('\n⑤ 진짜로 없는 파일의 표시는 그대로 둬야 한다 (사용자가 정말 치운 것)')
{
  const { root, old, e } = setup()
  fs.unlinkSync(path.join(old, NAMES[0]))
  e.markLocallyRemoved('a_' + NAMES[0], `개인작업/아저씨는 따봉이야/${NAMES[0]}`)
  const cleared = e.cleanupStaleRemovalMarks()
  ok('걷어내지 않았다', cleared === 0)
  ok('표시가 남아 있다 (다시 안 받게)', Object.keys(e.state.locallyRemoved).length === 1)
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('\n' + (fail ? `실패 ${fail}건` : '전부 통과'))
process.exit(fail ? 1 : 0)

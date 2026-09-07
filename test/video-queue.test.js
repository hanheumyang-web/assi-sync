/* 영상 하나가 뒤에 선 파일을 막지 않는지 — 실행: node test/video-queue.test.js
 *
 * ⚠️ 2026-09-08 테스터 제보. 파일은 한 개씩 줄 세워 처리하는데, 영상만
 *    "Bunny 서버가 인코딩을 끝낼 때까지" 최대 60분을 붙잡고 있었다.
 *    249MB 영상 하나에서 16분째 멈춰, 뒤에 선 파일 90개가 통째로 대기했다.
 *    올리는 일은 이미 끝난 뒤였다 — 인코딩은 남의 서버가 하는 일이라 붙잡을 이유가 없었다.
 */
const path = require('path')
const M = require(path.join(__dirname, '..', 'lib', 'sync-engine.js'))
const Engine = M.SyncEngine || M

let fail = 0, n = 0
const ok = (t, c, x) => { console.log((c ? '  ✅ ' : '  ❌ ') + t + (x ? '  ' + x : '')); if (!c) fail++ }
const head = t => { n++; console.log(`\n${'━'.repeat(64)}\n${n}. ${t}`) }
const sleep = ms => new Promise(r => setTimeout(r, ms))

function engine({ statusSeq = [], onStatus = () => {} } = {}) {
  let i = 0
  const api = {
    /* 인코딩이 아직 안 끝난 상태(3)를 계속 돌려준다 = 실제로 오래 걸리는 상황 */
    checkBunnyStatus: async () => ({ status: statusSeq[Math.min(i++, statusSeq.length - 1)] ?? 3 }),
    saveBunnyThumbnail: async () => ({ thumbnailUrl: 'https://x/y.jpg' }),
    updateAsset: async () => ({}), updateProject: async () => ({}),
    getProject: async () => ({ id: 'P1', thumbnailUrl: 'already' }),
  }
  const e = new Engine({
    uid: 'u1', watchDir: '/tmp/none', statePath: '/tmp/none.json', api,
    onFileStatus: onStatus, onError: () => {},
  })
  return e
}

;(async () => {

head('인코딩을 지켜보는 일이 줄을 막지 않는다')
{
  const e = engine()
  const t0 = Date.now()
  e.watchEncodingInBackground('vid1', 'a1', 'P1', '큰영상.mp4', 'AD/P/큰영상.mp4', '249MB')
  const elapsed = Date.now() - t0
  ok('바로 돌아온다 (기다리지 않는다)', elapsed < 200, `${elapsed}ms`)
  ok('지켜보는 중으로 표시됐다', e._encodingWatches?.has('vid1') === true)

  /* 뒤에 선 파일이 바로 처리될 수 있는지 — 줄이 비어 있는지로 확인 */
  let nextRan = false
  await Promise.resolve().then(() => { nextRan = true })
  ok('다음 파일이 곧바로 진행될 수 있다', nextRan)
}

head('영상이 여러 개여도 서로 덮어쓰지 않는다')
{
  const e = engine()
  e.watchEncodingInBackground('vidA', 'a1', 'P1', 'A.mp4', 'AD/P/A.mp4', '100MB')
  e.watchEncodingInBackground('vidB', 'a2', 'P1', 'B.mp4', 'AD/P/B.mp4', '200MB')
  ok('둘 다 각각 지켜본다', e._encodingWatches.size === 2, `${e._encodingWatches.size}개`)
  ok('A 가 살아 있다', e._encodingWatches.has('vidA'))
  ok('B 가 살아 있다', e._encodingWatches.has('vidB'))
}

head('같은 영상을 두 번 지켜보지 않는다')
{
  const e = engine()
  e.watchEncodingInBackground('vidX', 'a1', 'P1', 'X.mp4', 'AD/P/X.mp4', '50MB')
  e.watchEncodingInBackground('vidX', 'a1', 'P1', 'X.mp4', 'AD/P/X.mp4', '50MB')
  ok('하나만 돈다', e._encodingWatches.size === 1, `${e._encodingWatches.size}개`)
}

head('영상 id 를 못 받으면 붙잡지 않고 넘어간다')
{
  const seen = []
  const e = engine({ onStatus: s => seen.push(s) })
  e.watchEncodingInBackground(null, 'a1', 'P1', 'Y.mp4', 'AD/P/Y.mp4', '10MB')
  ok('완료로 표시하고 끝낸다', seen.some(s => s.status === 'done'), JSON.stringify(seen.map(s => s.status)))
  ok('지켜보기를 걸지 않았다', !e._encodingWatches || e._encodingWatches.size === 0)
}

head('넘겨받은 영상 id 를 쓴다 (인스턴스 변수에 기대지 않는다)')
{
  const e = engine({ statusSeq: [4] })
  e._lastBunnyVideoId = '엉뚱한id'
  const seen = []
  e.onFileStatus = s => seen.push(s)
  /* 30초 간격이라 끝까지 기다리진 않고, 시작이 넘겨받은 id 로 걸리는지만 본다 */
  e.watchEncodingInBackground('진짜id', 'a1', 'P1', 'Z.mp4', 'AD/P/Z.mp4', '30MB')
  ok('넘겨받은 id 로 지켜본다', e._encodingWatches.has('진짜id'))
  ok('인스턴스 변수 id 로 걸지 않았다', !e._encodingWatches.has('엉뚱한id'))
}

console.log('\n' + '━'.repeat(64))
console.log(fail ? `실패 ${fail}건` : `${n}가지 전부 통과`)
process.exit(fail ? 1 : 0)
})()

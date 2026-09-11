/* 무압축 공유 업로드 — 가짜 폴더와 가짜 서버로 실제 코드를 돌려 확인한다.
   실행: node test/share-upload.test.js

   2026-09-11 점검에서 나온 것들:
   ① 싱크 폴더 전체에서 파일 이름만으로 원본을 찾아 다른 고객 파일을 보낼 수 있었다
   ② 하나라도 실패하면 10초마다 영원히 다시 했고 웹 공유창은 끝나지 않았다
   ③ 파일을 통째로 메모리에 읽어서 2GB 넘는 원본은 못 보냈다
   ④ 10초 넘게 걸리면 같은 업로드가 겹쳐 시작됐다
   같은 날 코드 검토에서 나온 것들:
   ⑦ 마지막 "끝" 알림만 실패하면 공유가 7일 동안 돌았다
   ⑧ 같은 계정의 다른 컴퓨터(파일 없는 쪽)가 먼저 받아 전부 "못 올림" 으로 끝냈다
   ⑨ 10초 간격 3번 재시도라 30초 끊김에도 공유가 끝났다
   ⑩ 멈춘 업로드가 "도는 중" 표시를 붙잡아 다른 공유까지 영원히 막았다 */
const fs = require('fs'), path = require('path'), os = require('os')
const https = require('https')
const { Writable } = require('stream')
const EventEmitter = require('events')
const { SyncEngine } = require(path.join(__dirname, '..', 'lib', 'sync-engine.js'))

let fail = 0
const ok = (n, c) => { console.log((c ? '  ✅ ' : '  ❌ ') + n); if (!c) fail++ }
/* ⚠️ 기다리는 약속이 영영 안 풀리면 Node 는 할 일이 없다며 **성공(0)으로** 조용히 끝난다.
      그러면 멈춘 시험이 통과로 보인다 — 끝까지 왔는지 따로 확인한다. */
let 끝까지왔나 = false
process.on('exit', () => { if (!끝까지왔나) { console.log('\n❌ 시험이 끝나기 전에 멈췄다 (기다리던 일이 안 끝남)'); process.exitCode = 1 } })

/* 가짜 업로드 서버 — 받은 바이트 수와 머리글만 기록한다 (네트워크 안 씀) */
let 서버응답 = 200
let 서버멈춤 = false
let 받은 = []
https.request = (opts, cb) => {
  let n = 0
  let 멈춤콜백 = null
  const w = new Writable({ write(chunk, _enc, done) { n += chunk.length; done() } })
  w.setTimeout = (_ms, fn) => { 멈춤콜백 = fn; return w }
  /* 진짜 요청(http.ClientRequest)은 destroy(오류) 하면 'error' 를 낸다 — 끝난 스트림 흉내로는 안 내서 똑같이 맞춘다 */
  /* ⚠️ 쓰기가 끝나면 Node 가 오류 없이 destroy() 를 스스로 부른다 — 그때는 'error' 를 내면 안 된다 */
  w.destroy = (err) => { if (err) process.nextTick(() => w.emit('error', err)); return w }
  w.on('finish', () => {
    /* 서버가 답을 안 주는 상황 — 시간이 다 된 것처럼 바로 알린다 */
    if (서버멈춤) { setImmediate(() => 멈춤콜백 && 멈춤콜백()); return }
    받은.push({ bytes: n, headers: opts.headers })
    const res = new EventEmitter()
    res.statusCode = 서버응답
    cb(res)
    process.nextTick(() => { res.emit('data', 서버응답 >= 300 ? 'server error' : ''); res.emit('end') })
  })
  return w
}

function 폴더() { return fs.mkdtempSync(path.join(os.tmpdir(), 'pofol-share-')) }
function 놓기(root, rel, body) {
  const a = path.join(root, rel)
  fs.mkdirSync(path.dirname(a), { recursive: true })
  fs.writeFileSync(a, body)
  return fs.statSync(a).size
}
function 가짜api(pending = []) {
  const calls = []
  return {
    calls,
    getStorageUploadUrl: async () => ({ uploadUrl: 'https://storage.fake/upload?sig=1', token: 't' }),
    updateShareProgress: async (b) => { calls.push(b); return { ok: true } },
    getPendingShares: async () => { await new Promise(r => setTimeout(r, 60)); return { shares: pending } },
  }
}
function 엔진(root, syncedFiles, api) {
  const e = Object.create(SyncEngine.prototype)
  Object.assign(e, { watchDir: root, state: { syncedFiles }, api, onProgress() {}, onFileStatus() {}, onError() {} })
  return e
}
const 공유 = (assets, extra = {}) => ({
  id: 's1', projectId: 'p1', projectName: '봄 룩북',
  assets: assets.map(a => ({ uploadStatus: 'pending', shareStoragePath: `shares/u/s1/${a.id}_${a.fileName}`, ...a })),
  ...extra,
})

;(async () => {
  console.log('\n① 파일 이름만 같은 다른 촬영 원본을 집지 않는다')
  {
    const root = 폴더()
    놓기(root, 'A브랜드/IMG_0001.JPG', '다른 고객 원본')
    const e = 엔진(root, { 'A브랜드/IMG_0001.JPG': { assetId: 'x1', projectId: 'pOther' } }, 가짜api())
    ok('다른 프로젝트의 같은 이름 파일은 못 찾은 것으로 친다', e.findLocalPath('a-없음', 'IMG_0001.JPG', 'p1') === null)
    놓기(root, 'B브랜드/IMG_0001.JPG', '이 프로젝트 원본')
    e.state.syncedFiles['B브랜드/IMG_0001.JPG'] = { assetId: 'old', projectId: 'p1' }
    ok('같은 프로젝트에 속한 같은 이름 파일은 찾는다', e.findLocalPath('a-없음', 'IMG_0001.JPG', 'p1') === path.join(root, 'B브랜드', 'IMG_0001.JPG'))
  }

  console.log('\n② 다 올라가면 ready — 파일은 흘려 보낸다')
  {
    const root = 폴더(); 받은 = []; 서버응답 = 200
    const s1 = 놓기(root, '룩북/a.jpg', 'a'.repeat(5000))
    const s2 = 놓기(root, '룩북/b.mov', 'b'.repeat(12345))
    const api = 가짜api()
    const e = 엔진(root, { '룩북/a.jpg': { assetId: 'a1', projectId: 'p1' }, '룩북/b.mov': { assetId: 'a2', projectId: 'p1' } }, api)
    await e.processShareUpload(공유([{ id: 'a1', fileName: 'a.jpg' }, { id: 'a2', fileName: 'b.mov' }]))
    ok('처음에 "앱이 받아갔다" 를 알린다', api.calls[0]?.pickedUp === true)
    ok('두 파일 다 uploaded', api.calls.filter(c => c.uploadStatus === 'uploaded').length === 2)
    ok('마지막에 ready', api.calls.at(-1)?.status === 'ready')
    ok('보낸 바이트가 파일 크기와 같다', 받은[0].bytes === s1 && 받은[1].bytes === s2)
    ok('Content-Length 가 파일 크기다', 받은[0].headers['Content-Length'] === s1)
  }

  console.log('\n③ 원본이 없는 파일은 바로 "못 올림" — 나머지가 올라갔으면 partial')
  {
    const root = 폴더(); 받은 = []; 서버응답 = 200
    놓기(root, '룩북/a.jpg', 'aaaa')
    const api = 가짜api()
    const e = 엔진(root, { '룩북/a.jpg': { assetId: 'a1', projectId: 'p1' } }, api)
    await e.processShareUpload(공유([{ id: 'a1', fileName: 'a.jpg' }, { id: 'a3', fileName: 'gone.jpg' }]))
    const 못 = api.calls.find(c => c.assetId === 'a3')
    ok('없는 파일은 failed + 이유', 못?.uploadStatus === 'failed' && /찾지 못했어요/.test(못.failReason || ''))
    ok('다시 하지 않고 partial 로 끝낸다', api.calls.at(-1)?.status === 'partial')
  }

  console.log('\n④ 일시적인 실패는 3번째 시도에서 끝낸다')
  {
    const root = 폴더(); 받은 = []; 서버응답 = 500
    놓기(root, '룩북/a.jpg', 'aaaa')
    const synced = { '룩북/a.jpg': { assetId: 'a1', projectId: 'p1' } }
    const api1 = 가짜api()
    await 엔진(root, synced, api1).processShareUpload(공유([{ id: 'a1', fileName: 'a.jpg' }], { attempts: 0 }))
    ok('첫 실패는 시도 횟수만 적고 끝을 적지 않는다', api1.calls.some(c => c.attempts === 1) && !api1.calls.some(c => c.status))
    const api3 = 가짜api()
    await 엔진(root, synced, api3).processShareUpload(공유([{ id: 'a1', fileName: 'a.jpg' }], { attempts: 2 }))
    ok('세 번째도 실패하면 파일을 failed 로', api3.calls.some(c => c.assetId === 'a1' && c.uploadStatus === 'failed'))
    ok('하나도 못 올렸으니 failed 로 끝낸다 (서버가 건수를 돌려준다)', api3.calls.at(-1)?.status === 'failed')
    서버응답 = 200
  }

  console.log('\n⑤ 도는 중이면 겹쳐 시작하지 않는다')
  {
    const e = 엔진(폴더(), {}, 가짜api([]))
    const [r1, r2] = await Promise.all([e.checkPendingShares(), e.checkPendingShares()])
    ok('두 번째 호출은 busy', r2?.busy === true && !r1?.busy)
    const r3 = await e.checkPendingShares()
    ok('끝나면 다시 돈다', !r3?.busy)
  }

  console.log('\n⑥ 2GB 넘는 원본도 올린다 (통째로 읽지 않는다)')
  {
    const root = 폴더(); 받은 = []; 서버응답 = 200
    const big = path.join(root, '영상', 'C0001.MP4')
    fs.mkdirSync(path.dirname(big), { recursive: true })
    const size = 2 * 1024 ** 3 + 50 * 1024 ** 2
    fs.writeFileSync(big, ''); fs.truncateSync(big, size)   // 빈 칸으로 채운 큰 파일 (디스크를 거의 안 쓴다)
    const api = 가짜api()
    const e = 엔진(root, { '영상/C0001.MP4': { assetId: 'v1', projectId: 'p1' } }, api)
    const t0 = Date.now()
    await e.processShareUpload(공유([{ id: 'v1', fileName: 'C0001.MP4' }]))
    ok(`2.05GB 를 끝까지 보냈다 (${((Date.now() - t0) / 1000).toFixed(1)}초)`, 받은[0]?.bytes === size && api.calls.at(-1)?.status === 'ready')
    fs.rmSync(root, { recursive: true, force: true })
  }

  console.log('\n⑦ 마지막 "끝" 알림만 실패한 공유는 다음 확인에서 끝을 다시 적는다')
  {
    const root = 폴더()
    const api = 가짜api()
    const e = 엔진(root, { '룩북/a.jpg': { assetId: 'a1', projectId: 'p1' } }, api)
    await e.processShareUpload(공유([{ id: 'a1', fileName: 'a.jpg', uploadStatus: 'uploaded' }, { id: 'a2', fileName: 'b.jpg', uploadStatus: 'failed' }]))
    ok('일부만 올라갔으면 partial 을 다시 적는다', api.calls.at(-1)?.status === 'partial' && api.calls.at(-1)?.uploadedCount === 1)
    const api2 = 가짜api()
    await 엔진(root, {}, api2).processShareUpload(공유([{ id: 'a1', fileName: 'a.jpg', uploadStatus: 'uploaded' }]))
    ok('다 올라갔으면 ready 를 다시 적는다', api2.calls.at(-1)?.status === 'ready')
  }

  console.log('\n⑧ 이 컴퓨터에 그 프로젝트 파일이 없으면 손대지 않는다 (같은 계정의 다른 컴퓨터 몫)')
  {
    const api = 가짜api()
    const e = 엔진(폴더(), { '다른/x.jpg': { assetId: 'x', projectId: 'pOther' } }, api)
    await e.processShareUpload(공유([{ id: 'a1', fileName: 'a.jpg' }]))
    ok('아무것도 적지 않는다 (못 올림으로 끝내지 않는다)', api.calls.length === 0)
  }

  console.log('\n⑨ 다시 해 보기는 간격을 둔다')
  {
    const root = 폴더(); 서버응답 = 500
    놓기(root, '룩북/a.jpg', 'aaaa')
    const api = 가짜api()
    const e = 엔진(root, { '룩북/a.jpg': { assetId: 'a1', projectId: 'p1' } }, api)
    await e.processShareUpload(공유([{ id: 'a1', fileName: 'a.jpg' }], { attempts: 0 }))
    const 첫번째 = api.calls.length
    await e.processShareUpload(공유([{ id: 'a1', fileName: 'a.jpg' }], { attempts: 1 }))
    ok('실패 직후 바로는 다시 하지 않는다 (1분 뒤)', api.calls.length === 첫번째)
    e._shareRetryAt.set('s1', 0)
    await e.processShareUpload(공유([{ id: 'a1', fileName: 'a.jpg' }], { attempts: 1 }))
    ok('시간이 지나면 다시 한다 (2번째 시도)', api.calls.some(c => c.attempts === 2))
    ok('2번째 실패 뒤에는 5분 쉰다', e._shareRetryAt.get('s1') - Date.now() > 4 * 60 * 1000)
    서버응답 = 200
  }

  console.log('\n⑩ 멈춘 업로드는 끊고 나중에 다시 한다')
  {
    const root = 폴더(); 받은 = []; 서버멈춤 = true
    놓기(root, '룩북/a.jpg', 'aaaa')
    const api = 가짜api()
    const e = 엔진(root, { '룩북/a.jpg': { assetId: 'a1', projectId: 'p1' } }, api)
    await e.processShareUpload(공유([{ id: 'a1', fileName: 'a.jpg' }], { attempts: 0 }))
    ok('멈추면 끝나지 않고 돌아온다 — 일시 실패로 시도 횟수만 적는다', api.calls.some(c => c.attempts === 1) && !api.calls.some(c => c.status))
    서버멈춤 = false
  }

  끝까지왔나 = true
  console.log(fail ? `\n❌ ${fail}개 실패` : '\n✅ 전부 통과')
  process.exit(fail ? 1 : 0)
})()

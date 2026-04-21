// Phase 0 방어선 모듈 단위 테스트 (Node 직접 실행)
//
// 사용법:
//   cd desktop && node lib/_defense-test.js
//
// 통과하면 프로세스 종료 코드 0, 실패 시 1.
// Electron 환경 독립적으로 동작 (xattr-marker 는 OS 명령 쓰므로 실제 파일에 써보는 통합 테스트 포함).

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

const { RecentlyDownloaded } = require('./infinite-loop-guard')
const { UploadThrottle } = require('./upload-throttle')
const { atomicWrite } = require('./atomic-write')
const { markAsSynced, isMarkedSynced } = require('./xattr-marker')

let passed = 0, failed = 0
function test(name, fn) {
  try {
    const result = fn()
    if (result instanceof Promise) {
      return result.then(() => { console.log(`  ✅ ${name}`); passed++ })
                   .catch(e => { console.log(`  ❌ ${name}\n     ${e.message}`); failed++ })
    }
    console.log(`  ✅ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ❌ ${name}\n     ${e.message}`)
    failed++
  }
}

function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'expected'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`)
}

async function run() {
  console.log('\n=== RecentlyDownloaded Map ===')
  await test('mark+has → true', () => {
    const r = new RecentlyDownloaded({ ttlMs: 1000 })
    r.mark('hash-a')
    eq(r.has('hash-a'), true, 'has after mark')
    r.dispose()
  })
  await test('미등록 hash → false', () => {
    const r = new RecentlyDownloaded()
    eq(r.has('never'), false)
    r.dispose()
  })
  await test('TTL 만료 후 false', async () => {
    const r = new RecentlyDownloaded({ ttlMs: 50 })
    r.mark('hash-b')
    await new Promise(res => setTimeout(res, 80))
    eq(r.has('hash-b'), false)
    r.dispose()
  })

  console.log('\n=== UploadThrottle ===')
  await test('5회 이하 허용', () => {
    const t = new UploadThrottle({ maxPerMinute: 5 })
    for (let i = 0; i < 5; i++) eq(t.shouldAllow('h'), true, `${i+1}번째 허용`)
  })
  await test('6번째 block', () => {
    const t = new UploadThrottle({ maxPerMinute: 5 })
    for (let i = 0; i < 5; i++) t.shouldAllow('h')
    eq(t.shouldAllow('h'), false)
    eq(t.getBlocked().length, 1)
  })
  await test('unblock 후 재허용', () => {
    const t = new UploadThrottle({ maxPerMinute: 2 })
    t.shouldAllow('x'); t.shouldAllow('x'); t.shouldAllow('x') // 3회 → block
    eq(t.shouldAllow('x'), false)
    t.unblock('x')
    eq(t.shouldAllow('x'), true)
  })
  await test('직렬화 / 역직렬화 — 24h 이내', () => {
    const t = new UploadThrottle()
    t.blockedHashes.add('z')
    const json = t.serialize()
    const restored = UploadThrottle.deserialize(json)
    eq(restored.getBlocked().includes('z'), true)
  })
  await test('직렬화 / 24h 초과 → 리셋', () => {
    const fakeJson = { blockedHashes: ['old'], savedAt: Date.now() - 25 * 60 * 60 * 1000 }
    const restored = UploadThrottle.deserialize(fakeJson)
    eq(restored.getBlocked().length, 0)
  })

  console.log('\n=== atomicWrite + xattr 통합 ===')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assi-test-'))
  await test('atomicWrite → 파일 생성 + Layer 1 마킹', async () => {
    const r = new RecentlyDownloaded({ ttlMs: 10_000 })
    const targetPath = path.join(tmpDir, 'hello.txt')
    const data = Buffer.from('hello world')
    const hash = crypto.createHash('sha256').update(data).digest('hex')
    await atomicWrite(targetPath, data, { hash, recentlyDownloaded: r, xattrId: 'asset-1' })
    eq(fs.existsSync(targetPath), true)
    eq(fs.readFileSync(targetPath, 'utf-8'), 'hello world')
    eq(r.has(hash), true, 'Layer 1 마킹됨')
    r.dispose()
  })
  await test('atomicWrite → Layer 2 xattr (best effort)', async () => {
    const targetPath = path.join(tmpDir, 'marked.txt')
    const r = new RecentlyDownloaded({ ttlMs: 10_000 })
    await atomicWrite(targetPath, Buffer.from('x'), { hash: 'h', recentlyDownloaded: r, xattrId: 'asset-2' })
    // xattr 은 파일시스템 지원 시에만. 지원 안 하면 false 반환. 둘 다 OK.
    const marked = await isMarkedSynced(targetPath)
    console.log(`     (xattr 지원: ${marked})`)
    r.dispose()
  })
  await test('atomicWrite tmp 파일 rename 후 남지 않음', async () => {
    const targetPath = path.join(tmpDir, 'final.txt')
    const r = new RecentlyDownloaded({ ttlMs: 10_000 })
    await atomicWrite(targetPath, Buffer.from('done'), { hash: 'h', recentlyDownloaded: r, xattrId: 'a3' })
    const siblings = fs.readdirSync(tmpDir).filter(f => f.startsWith('.final.txt.'))
    eq(siblings.length, 0, 'tmp 파일 잔재 없음')
    r.dispose()
  })

  // 정리
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}

  console.log(`\n=== 결과: ${passed}개 통과 / ${failed}개 실패 ===`)
  process.exit(failed > 0 ? 1 : 0)
}

run().catch(e => { console.error(e); process.exit(1) })

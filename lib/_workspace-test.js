// ═════════════════════════════════════════════════════════════════════════
// Phase 2 W2 — desktop 신규 모듈 단위 테스트 (순수 로직)
// ─────────────────────────────────────────────────────────────────────────
// 실행: cd desktop && node lib/_workspace-test.js
// 에뮬레이터/네트워크 불필요. API 는 mock 주입.
// ═════════════════════════════════════════════════════════════════════════

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert')

const { determineDownloadSince } = require('./workspace-bootstrap')
const { isolateLocalChange, shouldIgnorePath, ViewerIsolationNotifier, LOCAL_CHANGES_DIR } = require('./viewer-guard')
const { WorkspaceManager, PERSONAL_CONTEXT } = require('./workspace-manager')

const results = []
const pass = (l) => results.push(['✅', l])
const fail = (l, e) => results.push(['❌', `${l} — ${e.message}`])
const run = async (label, fn) => { try { await fn(); pass(label) } catch (e) { fail(label, e) } }

async function main() {
// ── workspace-bootstrap ──────────────────────────────────────────────────
await run('1. state 에 syncedFiles 있으면 downloadSince 이어서', async () => {
  const r = await determineDownloadSince({
    stateBucket: { syncedFiles: { 'a.jpg': {} }, downloadSince: 12345 },
    deviceId: 'dev1', workspaceId: null,
    api: { isDeviceRegistered: async () => ({ registered: true }) },
  })
  assert.strictEqual(r.since, 12345)
  assert.strictEqual(r.reason, 'resume-from-state')
})

await run('2. state 비어있음 + deviceId 기등록 → NOW', async () => {
  const before = Date.now()
  const r = await determineDownloadSince({
    stateBucket: {},
    deviceId: 'dev1', workspaceId: 'wsX',
    api: { isDeviceRegistered: async () => ({ registered: true }) },
  })
  assert.ok(r.since >= before)
  assert.strictEqual(r.reason, 'device-reinstall-now')
})

await run('3. state 비어있음 + deviceId 신규 → 0 (통째 다운로드)', async () => {
  const r = await determineDownloadSince({
    stateBucket: {},
    deviceId: 'devNew', workspaceId: 'wsX',
    api: { isDeviceRegistered: async () => ({ registered: false }) },
  })
  assert.strictEqual(r.since, 0)
  assert.strictEqual(r.reason, 'fresh-device-full-download')
})

await run('4. api 실패 시 안전 fallback = NOW', async () => {
  const before = Date.now()
  const r = await determineDownloadSince({
    stateBucket: {},
    deviceId: 'dev1', workspaceId: null,
    api: { isDeviceRegistered: async () => { throw new Error('network') } },
  })
  assert.ok(r.since >= before)
  assert.strictEqual(r.reason, 'api-failed-fallback-now')
})

// ── viewer-guard ─────────────────────────────────────────────────────────
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'assi-vg-'))
await run('5. isolateLocalChange 가 .local-changes/ 로 복사', async () => {
  const src = path.join(tmpRoot, 'FASHION/cover.jpg')
  fs.mkdirSync(path.dirname(src), { recursive: true })
  fs.writeFileSync(src, 'hello')
  const { isolatedPath, relPath } = isolateLocalChange({ filePath: src, workspaceRoot: tmpRoot })
  assert.ok(fs.existsSync(isolatedPath), 'isolated file should exist')
  assert.ok(fs.existsSync(src), 'original must be preserved for viewer')
  assert.strictEqual(fs.readFileSync(isolatedPath, 'utf-8'), 'hello')
  assert.strictEqual(relPath, path.normalize('FASHION/cover.jpg'))
})

await run('6. shouldIgnorePath 가 .local-changes/ 하위 true', async () => {
  assert.ok(shouldIgnorePath(path.join(tmpRoot, LOCAL_CHANGES_DIR, 'x.jpg'), tmpRoot))
  assert.ok(!shouldIgnorePath(path.join(tmpRoot, 'FASHION/cover.jpg'), tmpRoot))
})

await run('7. ViewerIsolationNotifier 세션당 1회 알림', async () => {
  const calls = []
  const n = new ViewerIsolationNotifier({ onNotify: (e) => calls.push(e) })
  n.record('wsA')
  n.record('wsA')
  n.record('wsA')
  n.record('wsB')
  assert.strictEqual(calls.length, 2)                // wsA 1회 + wsB 1회
  assert.strictEqual(calls[0].workspaceId, 'wsA')
  assert.strictEqual(calls[0].firstTime, true)
  assert.strictEqual(n.getCount('wsA'), 3)
})

// ── workspace-manager ───────────────────────────────────────────────────
const mgrHome = fs.mkdtempSync(path.join(os.tmpdir(), 'assi-wm-'))
const personalRoot = path.join(mgrHome, 'ASSI')
fs.mkdirSync(personalRoot, { recursive: true })

const fakeApi = {
  getMyWorkspaces: async () => ({
    workspaces: [
      { id: 'ws1', name: '한남스튜디오', syncFolderName: '한남스튜디오', myRole: 'owner' },
      { id: 'ws2', name: 'Monument', syncFolderName: 'Monument', myRole: 'viewer' },
    ],
  }),
  isDeviceRegistered: async () => ({ registered: false }),
}

await run('8. WorkspaceManager.refresh 자동으로 팀 폴더 생성', async () => {
  const mgr = new WorkspaceManager({ api: fakeApi, homeDir: mgrHome, personalRoot })
  const ws = await mgr.refresh()
  assert.strictEqual(ws.length, 2)
  assert.ok(fs.existsSync(path.join(mgrHome, 'ASSI - 한남스튜디오')))
  assert.ok(fs.existsSync(path.join(mgrHome, 'ASSI - Monument')))
})

await run('9. resolveContext 가 경로 기반 컨텍스트 매핑', async () => {
  const mgr = new WorkspaceManager({ api: fakeApi, homeDir: mgrHome, personalRoot })
  await mgr.refresh()
  assert.strictEqual(mgr.resolveContext(path.join(personalRoot, 'foo.jpg')), PERSONAL_CONTEXT)
  assert.strictEqual(mgr.resolveContext(path.join(mgrHome, 'ASSI - 한남스튜디오', 'bar.jpg')), 'ws1')
  assert.strictEqual(mgr.resolveContext(path.join(mgrHome, 'ASSI - Monument', 'x.jpg')), 'ws2')
  assert.strictEqual(mgr.resolveContext(path.join(mgrHome, 'other', 'y.jpg')), null)
})

await run('10. getRole 이 팀/개인 올바르게', async () => {
  const mgr = new WorkspaceManager({ api: fakeApi, homeDir: mgrHome, personalRoot })
  await mgr.refresh()
  assert.strictEqual(mgr.getRole(PERSONAL_CONTEXT), 'owner')
  assert.strictEqual(mgr.getRole('ws1'), 'owner')
  assert.strictEqual(mgr.getRole('ws2'), 'viewer')
  assert.strictEqual(mgr.getRole('wsX'), null)
})

await run('11. getStateBucket personal 은 기존 state.syncedFiles 호환', async () => {
  const mgr = new WorkspaceManager({ api: fakeApi, homeDir: mgrHome, personalRoot })
  const state = { syncedFiles: { 'old.jpg': { assetId: 'a1' } } }
  const bucket = mgr.getStateBucket(state, PERSONAL_CONTEXT)
  assert.deepStrictEqual(bucket.syncedFiles, { 'old.jpg': { assetId: 'a1' } })
  bucket.downloadSince = 999
  assert.strictEqual(state.downloadSince, 999)
})

await run('12. getStateBucket workspace 는 별도 버킷', async () => {
  const mgr = new WorkspaceManager({ api: fakeApi, homeDir: mgrHome, personalRoot })
  const state = { syncedFiles: {} }
  const b1 = mgr.getStateBucket(state, 'ws1')
  b1.syncedFiles['team.jpg'] = { assetId: 't1' }
  b1.downloadSince = 42
  assert.deepStrictEqual(state.workspaces.ws1.syncedFiles, { 'team.jpg': { assetId: 't1' } })
  assert.strictEqual(state.workspaces.ws1.downloadSince, 42)
  assert.deepStrictEqual(state.syncedFiles, {}, 'personal bucket must not leak')
})

// ── 결과 ─────────────────────────────────────────────────────────────────
console.log('\n=== Desktop W2 Unit Test ===')
for (const [icon, label] of results) console.log(`  ${icon} ${label}`)
const failed = results.filter(r => r[0] === '❌').length
console.log(`\n총 ${results.length}개 중 ${results.length - failed}개 통과, ${failed}개 실패`)

// 정리
try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch {}
try { fs.rmSync(mgrHome, { recursive: true, force: true }) } catch {}

process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })

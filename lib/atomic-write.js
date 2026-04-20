// ═════════════════════════════════════════════════════════════════════════
// Phase 0 Layer 3 — atomic write + temp 파일
// ─────────────────────────────────────────────────────────────────────────
// 다운로드한 파일을 로컬에 쓸 때 직접 target 경로에 쓰지 않고 .tmp 에
// 먼저 쓰고 rename 으로 원자적 교체. chokidar 는 rename 이벤트를 받지만
// 그 시점엔 이미 Layer 1 마킹이 완료돼있어 루프를 차단한다.
//
// POSIX rename = atomic, Windows NTFS rename = MoveFileEx (MOVEFILE_REPLACE_EXISTING)
// 둘 다 atomic 이라 같은 파일시스템 안에서는 안전.
// ═════════════════════════════════════════════════════════════════════════

'use strict'

const fs = require('fs').promises
const path = require('path')
const { markAsSynced } = require('./xattr-marker')

/**
 * @param {string} targetPath     최종 목적지 절대 경로
 * @param {Buffer} data           파일 내용
 * @param {Object} ctx
 * @param {string} ctx.hash                    sha256 (Layer 1 마킹용)
 * @param {import('./infinite-loop-guard').RecentlyDownloaded} ctx.recentlyDownloaded
 * @param {string} ctx.xattrId                Layer 2 마커 값 (예: assetId)
 */
async function atomicWrite(targetPath, data, ctx) {
  const { hash, recentlyDownloaded, xattrId } = ctx || {}
  const dir = path.dirname(targetPath)
  const base = path.basename(targetPath)
  // `.foo.jpg.12345.tmp` — prefix `.` + pid 로 유니크
  const tmpPath = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`)

  // 디렉토리 없으면 생성
  await fs.mkdir(dir, { recursive: true })

  // 1. temp 파일에 씀
  await fs.writeFile(tmpPath, data)

  // 2. Layer 2 — xattr 마킹 (실패해도 OK)
  if (xattrId) {
    try { await markAsSynced(tmpPath, xattrId) } catch {}
  }

  // 3. Layer 1 — rename 이벤트 발생 "직전" 에 맵 업데이트
  //    (chokidar 가 rename 감지하는 순간 이미 맵에 있어야 함)
  if (recentlyDownloaded && hash) {
    recentlyDownloaded.mark(hash)
  }

  // 4. 원자적 rename — 기존 파일 있으면 덮어씀
  try {
    await fs.rename(tmpPath, targetPath)
  } catch (e) {
    // rename 실패 시 tmp 정리 시도
    try { await fs.unlink(tmpPath) } catch {}
    throw e
  }
}

module.exports = { atomicWrite }

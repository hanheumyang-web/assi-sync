// ═════════════════════════════════════════════════════════════════════════
// Phase 2 W2 — Workspace bootstrap: downloadSince 분기 로직
// ─────────────────────────────────────────────────────────────────────────
// 신규 디바이스/멤버 첫 연결 시 기존 자산 다운로드 gap 해결용.
//
// 분기:
//   1) state 에 syncedFiles 존재 (기존 sync 기록 있음) → 마지막 downloadSince 이어서
//   2) state 비어있음 + deviceId 가 서버에 이 컨텍스트로 등록된 적 있음 → NOW (재설치)
//   3) state 비어있음 + deviceId 신규 → 0 (첫 합류, 통째 다운로드)
//
// 동기화 루프에 통합되기 전 순수 함수로 분리 — 단위 테스트 가능.
// ═════════════════════════════════════════════════════════════════════════

/**
 * @param {object} opts
 * @param {object} opts.stateBucket — { syncedFiles?: {...}, downloadSince?: number, lastPolledAt?: number }
 * @param {string} opts.deviceId
 * @param {string|null} opts.workspaceId — null/undefined 이면 'personal' 컨텍스트
 * @param {object} opts.api — ApiClient 또는 { isDeviceRegistered(deviceId, workspaceId) } 최소 인터페이스
 * @returns {Promise<{ since: number, reason: string }>}
 */
async function determineDownloadSince({ stateBucket, deviceId, workspaceId, api }) {
  const bucket = stateBucket || {}
  const hasLocalState = Object.keys(bucket.syncedFiles || {}).length > 0

  if (hasLocalState) {
    const carryOver = typeof bucket.downloadSince === 'number'
      ? bucket.downloadSince
      : (bucket.lastPolledAt || 0)
    return { since: carryOver, reason: 'resume-from-state' }
  }

  // state 비어있음. 서버에 이 디바이스가 이 컨텍스트로 등록된 적 있나?
  let registered = false
  try {
    const result = await api.isDeviceRegistered(deviceId, workspaceId || null)
    registered = !!result?.registered
  } catch (e) {
    // 네트워크 실패 시 안전한 기본값 = NOW (전체 재다운 방지)
    return { since: Date.now(), reason: 'api-failed-fallback-now' }
  }

  if (registered) {
    return { since: Date.now(), reason: 'device-reinstall-now' }
  }
  return { since: 0, reason: 'fresh-device-full-download' }
}

module.exports = { determineDownloadSince }

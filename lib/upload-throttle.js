// ═════════════════════════════════════════════════════════════════════════
// Phase 0 안전판 — 업로드 throttle (60초 내 5회 초과 시 자동 정지)
// ─────────────────────────────────────────────────────────────────────────
// Dropbox 7년차 50GB 하룻밤 사고 재현 방지. 같은 contentHash 가 1분에
// 5번 이상 업로드되려 하면 루프로 간주하고 자동 정지 + 경고.
//
// Layer 1~3 이 다 뚫려도 이게 최후 방어선. 전체 시스템 폭주를 비용 차원에서 막는다.
// ═════════════════════════════════════════════════════════════════════════

'use strict'

class UploadThrottle {
  /**
   * @param {Object} opts
   * @param {number} [opts.maxPerMinute=5]   1분 내 허용 횟수
   * @param {number} [opts.windowMs=60000]
   */
  constructor(opts = {}) {
    this.max = opts.maxPerMinute ?? 5
    this.window = opts.windowMs ?? 60 * 1000
    this.attempts = new Map() // hash -> [timestamp, ...]
    this.blockedHashes = new Set()
  }

  /**
   * 업로드 시도 전 호출. false 반환 시 업로드 중단.
   * @param {string} hash  파일 content hash
   * @returns {boolean} 허용 여부
   */
  shouldAllow(hash) {
    if (!hash) return true
    if (this.blockedHashes.has(hash)) return false

    const now = Date.now()
    const recent = (this.attempts.get(hash) || []).filter(t => now - t < this.window)
    recent.push(now)
    this.attempts.set(hash, recent)

    if (recent.length > this.max) {
      this.blockedHashes.add(hash)
      return false
    }
    return true
  }

  /** 현재 block 걸린 해시 목록 (알림/UI 용) */
  getBlocked() {
    return [...this.blockedHashes]
  }

  /** 사용자가 "무시하고 계속" 버튼 누르면 초기화 */
  unblock(hash) {
    this.blockedHashes.delete(hash)
    this.attempts.delete(hash)
  }

  /** 전체 리셋 */
  reset() {
    this.blockedHashes.clear()
    this.attempts.clear()
  }

  /** 상태 직렬화 (앱 재시작 간 보존용 — 로컬 파일에 JSON 저장) */
  serialize() {
    return {
      blockedHashes: [...this.blockedHashes],
      savedAt: Date.now(),
    }
  }

  /** 역직렬화 — 24시간 이내 데이터만 복원 */
  static deserialize(json, opts) {
    const t = new UploadThrottle(opts)
    if (!json || !json.blockedHashes || !json.savedAt) return t
    if (Date.now() - json.savedAt > 24 * 60 * 60 * 1000) return t // 24h 초과면 리셋
    json.blockedHashes.forEach(h => t.blockedHashes.add(h))
    return t
  }
}

module.exports = { UploadThrottle }

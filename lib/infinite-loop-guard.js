// ═════════════════════════════════════════════════════════════════════════
// Phase 0 Layer 1 — recentlyDownloaded Map (60초 TTL)
// ─────────────────────────────────────────────────────────────────────────
// 다운로드 직후 파일 해시를 60초간 기억. chokidar add/change 이벤트에서
// 이 맵에 존재하면 "내가 방금 받은 파일이 모디파이 이벤트로 돌아온 것" 으로
// 간주하고 업로드 루프를 끊는다.
//
// 3중 방어의 첫 라인. USB/FAT32 처럼 xattr 이 안 되는 파일시스템에서도 동작.
// ═════════════════════════════════════════════════════════════════════════

'use strict'

class RecentlyDownloaded {
  /**
   * @param {Object} opts
   * @param {number} [opts.ttlMs=60000]   TTL (기본 60초)
   * @param {number} [opts.gcIntervalMs=10000]  가비지 컬렉션 주기
   */
  constructor(opts = {}) {
    this.ttl = opts.ttlMs ?? 60 * 1000
    this.map = new Map() // hash (string) -> expiresAt (number)
    const gcInterval = opts.gcIntervalMs ?? 10 * 1000
    this._gcTimer = setInterval(() => this.gc(), gcInterval)
    // 앱 종료 방해 안 되게
    if (this._gcTimer.unref) this._gcTimer.unref()
  }

  /** 다운로드 완료 직후 호출. `mark(contentHash)` */
  mark(hash) {
    if (!hash) return
    this.map.set(hash, Date.now() + this.ttl)
  }

  /** chokidar 이벤트 시작부에서 `has(contentHash)` → true 면 조용히 return */
  has(hash) {
    if (!hash) return false
    const exp = this.map.get(hash)
    if (!exp) return false
    if (Date.now() > exp) {
      this.map.delete(hash)
      return false
    }
    return true
  }

  /** TTL 만료 엔트리 제거 (setInterval 로 자동 호출) */
  gc() {
    const now = Date.now()
    for (const [hash, exp] of this.map) {
      if (now > exp) this.map.delete(hash)
    }
  }

  /** 현재 추적 중인 해시 개수 (디버그용) */
  size() { return this.map.size }

  /** 앱 종료 시 호출 */
  dispose() {
    if (this._gcTimer) clearInterval(this._gcTimer)
    this.map.clear()
  }
}

module.exports = { RecentlyDownloaded }

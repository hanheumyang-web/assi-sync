// ═════════════════════════════════════════════════════════════════════════
// Phase 0 — Device Registry (디바이스 식별 + heartbeat)
// ─────────────────────────────────────────────────────────────────────────
// 앱 첫 실행 시 UUID 디바이스 ID 발급. Electron safeStorage 로 OS 키체인에
// 암호화 저장. 30초 간격 heartbeat 로 Firestore 에 생존 신고.
//
// 웹 대시보드가 이 값 onSnapshot 으로 구독하면 "내 디바이스 목록" + 온라인
// 여부 표시. 원격 로그아웃(revoked:true) 감지 시 자동 로그아웃.
//
// Phase 1 에서 sync-engine 에 통합. Phase 0 에서는 API/스펙만.
// ═════════════════════════════════════════════════════════════════════════

'use strict'

const os = require('os')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')

const HEARTBEAT_INTERVAL_MS = 30 * 1000
const OFFLINE_THRESHOLD_MS = 90 * 1000

class DeviceRegistry {
  /**
   * @param {Object} deps
   * @param {import('electron').SafeStorage} [deps.safeStorage]  electron safeStorage (optional)
   * @param {string} deps.userDataDir                 app.getPath('userData')
   * @param {Object} deps.api                         api-client (updateDevice, getDevice 필요)
   * @param {string} deps.uid
   */
  constructor(deps) {
    this.safeStorage = deps.safeStorage || null
    this.userDataDir = deps.userDataDir
    this.api = deps.api
    this.uid = deps.uid
    this.deviceId = null
    this._hbTimer = null
    this._revokedCb = null
  }

  /** 첫 실행 시 UUID 발급 → safeStorage 암호화 저장. 이후는 읽기. */
  async load() {
    const file = path.join(this.userDataDir, '.device-id')
    // safeStorage 사용 가능하면 암호화본 우선
    const encFile = path.join(this.userDataDir, '.device-id.enc')

    if (this.safeStorage?.isEncryptionAvailable?.() && fs.existsSync(encFile)) {
      const enc = fs.readFileSync(encFile)
      this.deviceId = this.safeStorage.decryptString(enc)
      return this.deviceId
    }
    if (fs.existsSync(file)) {
      this.deviceId = fs.readFileSync(file, 'utf-8').trim()
      return this.deviceId
    }

    // 신규 발급
    this.deviceId = crypto.randomUUID()
    if (this.safeStorage?.isEncryptionAvailable?.()) {
      fs.writeFileSync(encFile, this.safeStorage.encryptString(this.deviceId))
    } else {
      fs.writeFileSync(file, this.deviceId, 'utf-8')
    }
    return this.deviceId
  }

  /** 앱 시작 시 호출. devices 문서 upsert + heartbeat 타이머 시작. */
  async start({ appVersion, deviceName }) {
    if (!this.deviceId) await this.load()

    const doc = {
      id: this.deviceId,
      name: deviceName || os.hostname(),
      os: process.platform,       // 'darwin' | 'win32' | 'linux'
      arch: process.arch,
      appVersion,
      lastSeenAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
    }
    await this.api.updateDevice(this.uid, this.deviceId, doc, { upsert: true })

    this._hbTimer = setInterval(() => this._heartbeat(), HEARTBEAT_INTERVAL_MS)
    if (this._hbTimer.unref) this._hbTimer.unref()
  }

  async _heartbeat() {
    try {
      const doc = await this.api.getDevice(this.uid, this.deviceId)
      if (doc?.revoked === true) {
        if (this._revokedCb) this._revokedCb()
        return
      }
      await this.api.updateDevice(this.uid, this.deviceId, {
        lastHeartbeat: new Date().toISOString(),
      })
    } catch (e) {
      // 네트워크 오류 조용히 무시
    }
  }

  /** 웹에서 "이 기기 로그아웃" 하면 revoked:true 가 되어 여기로 통지 */
  onRevoked(callback) { this._revokedCb = callback }

  async stop() {
    if (this._hbTimer) clearInterval(this._hbTimer)
    this._hbTimer = null
  }

  /** 특정 workspace 의 로컬 폴더 경로 기록 (Phase 2 에서 사용) */
  async setSyncFolderPath(workspaceId, absPath) {
    await this.api.updateDevice(this.uid, this.deviceId, {
      [`syncFolderPaths.${workspaceId}`]: absPath,
    })
  }
}

module.exports = { DeviceRegistry, HEARTBEAT_INTERVAL_MS, OFFLINE_THRESHOLD_MS }

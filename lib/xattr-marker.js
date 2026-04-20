// ═════════════════════════════════════════════════════════════════════════
// Phase 0 Layer 2 — OS extended attribute 마킹
// ─────────────────────────────────────────────────────────────────────────
// "이 파일은 동기화로 받은 것" 이라는 플래그를 OS 메타데이터에 기록.
// chokidar 가 이벤트 올렸을 때 flag 확인 → 있으면 업로드 스킵.
//
// - macOS: `xattr -w` 명령 (POSIX extended attributes)
// - Windows: NTFS Alternate Data Stream (`filePath:stream` 경로로 쓰기)
// - Linux: `setfattr` (user_xattr 마운트 옵션 필요)
//
// 실패해도 OK — Layer 1 (recentlyDownloaded Map) 과 Layer 3 (atomic write)
// 이 이미 방어 중이라 xattr 미지원 파일시스템(FAT32/exFAT/SMB)에서도
// 동기화 자체는 동작한다.
// ═════════════════════════════════════════════════════════════════════════

'use strict'

const fs = require('fs').promises
const { execFile } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)

const MARKER_NAME = 'com.assi.synced'
const NTFS_STREAM = `:${MARKER_NAME}`

/**
 * 다운로드 완료 후 호출. 파일에 "동기화 마커" 를 부착한다.
 * 실패해도 throw 하지 않음 (상위 Layer 1/3 이 이미 방어 중).
 *
 * @param {string} filePath  절대 경로
 * @param {string} assetId    Firestore assetId (마커 값)
 * @returns {Promise<boolean>} 성공 여부
 */
async function markAsSynced(filePath, assetId) {
  try {
    if (process.platform === 'darwin') {
      await execFileAsync('xattr', ['-w', MARKER_NAME, assetId, filePath])
      return true
    }
    if (process.platform === 'win32') {
      // NTFS ADS: `filePath:com.assi.synced`
      await fs.writeFile(filePath + NTFS_STREAM, assetId, 'utf-8')
      return true
    }
    // Linux / 기타
    await execFileAsync('setfattr', ['-n', `user.${MARKER_NAME}`, '-v', assetId, filePath])
    return true
  } catch (e) {
    // 파일시스템 미지원 등 — 조용히 무시. Layer 1/3 이 백업.
    if (process.env.ASSI_DEBUG_XATTR) {
      console.warn(`[xattr] mark 실패 ${filePath}: ${e.message}`)
    }
    return false
  }
}

/**
 * chokidar 이벤트 시작부에서 호출. 마커가 있으면 동기화로 받은 파일.
 *
 * @param {string} filePath
 * @returns {Promise<boolean>} 마커 존재 여부
 */
async function isMarkedSynced(filePath) {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execFileAsync('xattr', ['-p', MARKER_NAME, filePath])
      return stdout.trim().length > 0
    }
    if (process.platform === 'win32') {
      const data = await fs.readFile(filePath + NTFS_STREAM, 'utf-8')
      return data.length > 0
    }
    const { stdout } = await execFileAsync('getfattr', ['-n', `user.${MARKER_NAME}`, '--only-values', filePath])
    return stdout.length > 0
  } catch {
    return false
  }
}

/** 마커 값 조회 (디버그/감사용). 없으면 null. */
async function getSyncedAssetId(filePath) {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execFileAsync('xattr', ['-p', MARKER_NAME, filePath])
      return stdout.trim() || null
    }
    if (process.platform === 'win32') {
      const data = await fs.readFile(filePath + NTFS_STREAM, 'utf-8')
      return data || null
    }
    const { stdout } = await execFileAsync('getfattr', ['-n', `user.${MARKER_NAME}`, '--only-values', filePath])
    return stdout || null
  } catch {
    return null
  }
}

module.exports = { markAsSynced, isMarkedSynced, getSyncedAssetId, MARKER_NAME }

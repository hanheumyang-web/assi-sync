// Desktop API Client — calls Vercel backend with Firebase ID token auth
// Replaces direct Firebase Admin SDK and Bunny API key usage

const API_BASE = 'https://assifolio.com/api/desktop'
const FIREBASE_API_KEY = 'AIzaSyD-JUPcZ5iIIBEtoCE7YPye0PRP4WTPGgg'

class ApiClient {
  constructor({ idToken, refreshToken, onTokenRefreshed }) {
    this.idToken = idToken
    this.refreshToken = refreshToken
    this.onTokenRefreshed = onTokenRefreshed || (() => {})
    this.tokenExpiresAt = Date.now() + 55 * 60 * 1000 // ~55 min (tokens last 1 hour)
  }

  async ensureFreshToken() {
    if (Date.now() < this.tokenExpiresAt) return
    if (!this.refreshToken) throw new Error('No refresh token available')

    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      }),
    })
    const data = await res.json()
    if (data.error) throw new Error(`Token refresh failed: ${data.error.message}`)

    this.idToken = data.id_token
    this.refreshToken = data.refresh_token
    this.tokenExpiresAt = Date.now() + 55 * 60 * 1000
    this.onTokenRefreshed({ idToken: this.idToken, refreshToken: this.refreshToken })
  }

  async request(endpoint, body) {
    await this.ensureFreshToken()

    const res = await fetch(`${API_BASE}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.idToken}`,
      },
      body: JSON.stringify(body),
    })

    if (res.status === 401) {
      // Force refresh and retry once
      this.tokenExpiresAt = 0
      await this.ensureFreshToken()
      const retry = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.idToken}`,
        },
        body: JSON.stringify(body),
      })
      if (!retry.ok) throw new Error(`API error ${retry.status}: ${await retry.text()}`)
      return retry.json()
    }

    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
    return res.json()
  }

  // ── Projects ──

  async findOrCreateProject(name, category) {
    return this.request('firestore', { action: 'findOrCreateProject', name, category: category || null })
  }

  async updateProject(projectId, data) {
    return this.request('firestore', { action: 'updateProject', projectId, data })
  }

  async deleteProject(projectId) {
    return this.request('firestore', { action: 'deleteProject', projectId })
  }

  async getProject(projectId) {
    return this.request('firestore', { action: 'getProject', projectId })
  }

  // ── Assets ──

  async createAsset(data) {
    return this.request('firestore', { action: 'createAsset', data })
  }

  async updateAsset(assetId, data) {
    return this.request('firestore', { action: 'updateAsset', assetId, data })
  }

  async deleteAsset(assetId) {
    return this.request('firestore', { action: 'deleteAsset', assetId })
  }

  async getAssetsByProject(projectId) {
    return this.request('firestore', { action: 'getAssetsByProject', projectId })
  }

  async getProjectsByUid() {
    return this.request('firestore', { action: 'getProjectsByUid' })
  }

  // ── Phase 1 다운로드 폴링 — since 이후 변경된 자산 목록 ──
  // since 미지정 시 전체. 서버가 nextSince 를 돌려주면 다음 폴링 때 그 값 전달.
  async listAssetsSince(since, limit) {
    return this.request('firestore', { action: 'listAssetsSince', since, limit })
  }

  // HTTP GET 으로 Storage/Bunny URL 에서 바이트 받아옴.
  // Storage URL 은 public download URL 이라 인증 불필요.
  async downloadFile(url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Download ${url} failed: HTTP ${res.status}`)
    const ab = await res.arrayBuffer()
    return Buffer.from(ab)
  }

  // ── Phase 1 Device Registry ──
  // users/{uid}/devices/{deviceId} 서브컬렉션 CRUD. 본인 uid 만 접근 가능.
  async updateDevice(uid, deviceId, data, opts = {}) {
    return this.request('firestore', { action: 'updateDevice', uid, deviceId, data, upsert: !!opts.upsert })
  }

  async getDevice(uid, deviceId) {
    return this.request('firestore', { action: 'getDevice', uid, deviceId })
  }

  async listDevices() {
    return this.request('firestore', { action: 'listDevices' })
  }

  async revokeDevice(deviceId) {
    return this.request('firestore', { action: 'revokeDevice', deviceId })
  }

  // ── Content-hash dedup ──

  // 같은 uid + contentHash 자산 1개 반환 (없으면 null). 인덱스: (uid, contentHash)
  async findAssetByContentHash(contentHash) {
    return this.request('firestore', { action: 'findAssetByContentHash', contentHash })
  }

  // 자산을 다른 프로젝트로 이동 — Storage/Bunny 무손상, projectId만 변경
  // 양쪽 프로젝트 카운터 자동 ±1
  async moveAsset(assetId, newProjectId, newFileName) {
    return this.request('firestore', { action: 'moveAsset', assetId, newProjectId, newFileName })
  }

  // ── Storage ──

  async getUploadUrl(storagePath, contentType) {
    return this.request('storage', { action: 'getUploadUrl', storagePath, contentType })
  }

  async deleteFile(storagePath) {
    return this.request('storage', { action: 'deleteFile', storagePath })
  }

  async uploadFile(buffer, storagePath, contentType) {
    // 1. Get signed upload URL from backend
    const { uploadUrl, downloadUrl, headers } = await this.getUploadUrl(storagePath, contentType)

    // 2. Upload directly to Firebase Storage (no size limit through our backend)
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers,
      body: buffer,
    })
    if (!uploadRes.ok) throw new Error(`Storage upload failed: ${uploadRes.status}`)

    return downloadUrl
  }

  async uploadFileStream(filePath, storagePath, contentType, fileSize) {
    const fs = require('fs')
    const { Readable } = require('stream')

    const { uploadUrl, downloadUrl, headers } = await this.getUploadUrl(storagePath, contentType)

    const nodeStream = fs.createReadStream(filePath)
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { ...headers, 'Content-Length': fileSize.toString() },
      body: Readable.toWeb(nodeStream),
      duplex: 'half',
    })
    if (!uploadRes.ok) throw new Error(`Storage stream upload failed: ${uploadRes.status}`)

    return downloadUrl
  }

  // ── Bunny ──

  async createBunnyVideo(title) {
    return this.request('bunny', { action: 'createVideo', title })
  }

  async tusUpload(bufferOrPath, videoId, tusAuth, fileSize) {
    const fs = require('fs')
    const isFilePath = typeof bufferOrPath === 'string'
    const totalSize = isFilePath ? (fileSize || fs.statSync(bufferOrPath).size) : bufferOrPath.length

    // TUS protocol: Create upload
    const createRes = await fetch('https://video.bunnycdn.com/tusupload', {
      method: 'POST',
      headers: {
        'AuthorizationSignature': tusAuth.signature,
        'AuthorizationExpire': tusAuth.expire,
        'VideoId': videoId,
        'LibraryId': tusAuth.libraryId,
        'Tus-Resumable': '1.0.0',
        'Upload-Length': totalSize.toString(),
        'Content-Type': 'application/offset+octet-stream',
      },
    })

    if (!createRes.ok) throw new Error(`TUS create failed: ${createRes.status}`)
    let location = createRes.headers.get('location')
    if (!location) throw new Error('TUS upload: no location header')
    // Bunny returns relative path — convert to full URL
    if (!location.startsWith('http')) location = 'https://video.bunnycdn.com' + location

    if (!isFilePath) {
      // Small file: single PATCH (backward compatible)
      const patchRes = await fetch(location, {
        method: 'PATCH',
        headers: {
          'AuthorizationSignature': tusAuth.signature,
          'AuthorizationExpire': tusAuth.expire,
          'VideoId': videoId,
          'LibraryId': tusAuth.libraryId,
          'Tus-Resumable': '1.0.0',
          'Upload-Offset': '0',
          'Content-Type': 'application/offset+octet-stream',
        },
        body: bufferOrPath,
      })
      if (!patchRes.ok) throw new Error(`TUS upload failed: ${patchRes.status}`)
      return
    }

    // Large file: chunked PATCH (50MB per chunk, only 50MB in RAM at a time)
    const CHUNK_SIZE = 50 * 1024 * 1024
    let offset = 0
    const fd = fs.openSync(bufferOrPath, 'r')
    try {
      while (offset < totalSize) {
        const chunkSize = Math.min(CHUNK_SIZE, totalSize - offset)
        const chunk = Buffer.alloc(chunkSize)
        fs.readSync(fd, chunk, 0, chunkSize, offset)

        const patchRes = await fetch(location, {
          method: 'PATCH',
          headers: {
            'AuthorizationSignature': tusAuth.signature,
            'AuthorizationExpire': tusAuth.expire,
            'VideoId': videoId,
            'LibraryId': tusAuth.libraryId,
            'Tus-Resumable': '1.0.0',
            'Upload-Offset': offset.toString(),
            'Content-Type': 'application/offset+octet-stream',
            'Content-Length': chunkSize.toString(),
          },
          body: chunk,
        })
        if (!patchRes.ok) throw new Error(`TUS chunk failed at offset ${offset}: ${patchRes.status}`)
        offset += chunkSize
      }
    } finally {
      fs.closeSync(fd)
    }
  }

  async checkBunnyStatus(videoId) {
    return this.request('bunny', { action: 'checkStatus', videoId })
  }

  async saveBunnyThumbnail(videoId, projectId) {
    return this.request('bunny', { action: 'saveThumbnail', videoId, projectId })
  }

  // ── Share Upload (무압축 공유) ──

  async getPendingShares() {
    return this.request('firestore', { action: 'getPendingShares' })
  }

  async updateShareProgress({ shareId, assetId, uploadStatus, uploadedCount, status, actualFileSize }) {
    return this.request('firestore', {
      action: 'updateShareProgress',
      shareId, assetId, uploadStatus, uploadedCount, status, actualFileSize,
    })
  }

  async getStorageUploadUrl(storagePath, contentType) {
    return this.request('storage', {
      action: 'getUploadUrl',
      storagePath,
      contentType,
    })
  }

  // ── Phase 2 Workspace ────────────────────────────────────────────────────

  async createWorkspace(name, syncFolderName) {
    return this.request('firestore', { action: 'createWorkspace', name, syncFolderName })
  }

  async getMyWorkspaces() {
    return this.request('firestore', { action: 'getMyWorkspaces' })
  }

  async getWorkspace(wsId) {
    return this.request('firestore', { action: 'getWorkspace', wsId })
  }

  async listWorkspaceMembers(wsId) {
    return this.request('firestore', { action: 'listWorkspaceMembers', wsId })
  }

  async removeMember(wsId, uidToRemove) {
    return this.request('firestore', { action: 'removeMember', wsId, uidToRemove })
  }

  async leaveWorkspace(wsId) {
    return this.request('firestore', { action: 'leaveWorkspace', wsId })
  }

  async generateInvite(wsId, expiresInDays = 7, maxUses = 5) {
    return this.request('firestore', { action: 'generateInvite', wsId, expiresInDays, maxUses })
  }

  async listInvitations(wsId) {
    return this.request('firestore', { action: 'listInvitations', wsId })
  }

  async revokeInvitation(wsId, invId) {
    return this.request('firestore', { action: 'revokeInvitation', wsId, invId })
  }

  async joinByCode(code) {
    return this.request('firestore', { action: 'joinByCode', code })
  }

  async getMyRole(wsId) {
    return this.request('firestore', { action: 'getMyRole', wsId })
  }

  async getWorkspaceProjects(wsId, since, limit = 1000) {
    return this.request('firestore', { action: 'getWorkspaceProjects', wsId, since, limit })
  }

  async getWorkspaceAssets(wsId, since, limit = 1000) {
    return this.request('firestore', { action: 'getWorkspaceAssets', wsId, since, limit })
  }

  async getWorkspaceActivity(wsId, sinceTs, limit = 100) {
    return this.request('firestore', { action: 'getWorkspaceActivity', wsId, sinceTs, limit })
  }

  async isDeviceRegistered(deviceId, workspaceId) {
    return this.request('firestore', { action: 'isDeviceRegistered', deviceId, workspaceId })
  }
}

module.exports = { ApiClient }

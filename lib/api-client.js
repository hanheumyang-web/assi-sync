// Desktop API Client — calls Vercel backend with Firebase ID token auth
// Replaces direct Firebase Admin SDK and Bunny API key usage

const API_BASE = 'https://assi-portfolio.vercel.app/api/desktop'
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

  // ── Bunny ──

  async createBunnyVideo(title) {
    return this.request('bunny', { action: 'createVideo', title })
  }

  async tusUpload(buffer, videoId, tusAuth) {
    // TUS protocol: Create upload → PATCH data
    const createRes = await fetch('https://video.bunnycdn.com/tusupload', {
      method: 'POST',
      headers: {
        'AuthorizationSignature': tusAuth.signature,
        'AuthorizationExpire': tusAuth.expire,
        'VideoId': videoId,
        'LibraryId': tusAuth.libraryId,
        'Tus-Resumable': '1.0.0',
        'Upload-Length': buffer.length.toString(),
        'Content-Type': 'application/offset+octet-stream',
      },
    })

    if (!createRes.ok) throw new Error(`TUS create failed: ${createRes.status}`)
    const location = createRes.headers.get('location')
    if (!location) throw new Error('TUS upload: no location header')

    // Upload the data
    const patchRes = await fetch(location, {
      method: 'PATCH',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': '0',
        'Content-Type': 'application/offset+octet-stream',
      },
      body: buffer,
    })
    if (!patchRes.ok) throw new Error(`TUS upload failed: ${patchRes.status}`)
  }

  async checkBunnyStatus(videoId) {
    return this.request('bunny', { action: 'checkStatus', videoId })
  }

  async saveBunnyThumbnail(videoId, projectId) {
    return this.request('bunny', { action: 'saveThumbnail', videoId, projectId })
  }
}

module.exports = { ApiClient }

// ASSI Sync Engine v2 — Secure edition
// No more Firebase Admin SDK or hardcoded API keys
// All operations go through the Vercel API backend

const chokidar = require('chokidar')
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const MAX_DIM = 2048
const MAX_SIZE = 7 * 1024 * 1024
const JPEG_QUALITY = 92

const CONTENT_TYPE_MAP = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp',
  tif: 'image/tiff', tiff: 'image/tiff', avif: 'image/avif',
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
  webm: 'video/webm', m4v: 'video/x-m4v', wmv: 'video/x-ms-wmv', flv: 'video/x-flv',
  cr2: 'image/x-canon-cr2', nef: 'image/x-nikon-nef', arw: 'image/x-sony-arw',
  dng: 'image/x-adobe-dng', raf: 'image/x-fuji-raf',
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'avif', 'cr2', 'nef', 'arw', 'dng', 'raf'])
const VIDEO_EXTS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'wmv', 'flv'])
const IGNORED = new Set(['thumbs.db', 'desktop.ini', '.ds_store'])

// 기본 카테고리 (1단계 폴더명이 매칭되면 자동 카테고리로 인식)
const DEFAULT_CATEGORIES = ['FASHION', 'BEAUTY', 'CELEBRITY', 'AD', 'PORTRAIT', 'PERSONAL WORK']
function normalizeCategory(name) {
  if (!name) return null
  return name.trim().toUpperCase()
}

function getExt(name) { return name?.split('.').pop()?.toLowerCase() }
function guessContentType(name) { return CONTENT_TYPE_MAP[getExt(name)] || 'application/octet-stream' }
function isImage(name) { return IMAGE_EXTS.has(getExt(name)) }
function isVideo(name) { return VIDEO_EXTS.has(getExt(name)) }
function isSupported(name) { return isImage(name) || isVideo(name) }
function isIgnored(name) { const b = name.split(/[/\\]/).pop().toLowerCase(); return b.startsWith('.') || IGNORED.has(b) }
function fmt(bytes) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

class SyncEngine {
  constructor({ uid, watchDir, statePath, api, onProgress, onFileStatus, onError, onNewFolder, onFolderRemoved }) {
    this.uid = uid
    this.watchDir = watchDir
    this.statePath = statePath
    this.api = api // ApiClient instance
    this.onProgress = onProgress || (() => {})
    this.onFileStatus = onFileStatus || (() => {})
    this.onError = onError || (() => {})
    this.onNewFolder = onNewFolder || (() => true)
    this.onFolderRemoved = onFolderRemoved || (() => {})
    this.approvedFolders = new Set()
    this.deniedFolders = new Set()
    this.pendingFolders = new Map()
    this.watcher = null
    this.state = { syncedFiles: {} }
    this.failedFiles = new Map()
    this.projectCache = new Map()
    this._ready = false

    this.loadState()
  }

  loadState() {
    try {
      if (fs.existsSync(this.statePath))
        this.state = JSON.parse(fs.readFileSync(this.statePath, 'utf-8'))
    } catch { this.state = { syncedFiles: {} } }
  }

  saveState() {
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2))
  }

  getRelPath(filePath) {
    return path.relative(this.watchDir, filePath).split(path.sep).join('/')
  }

  // depth 3 구조: [category]/[project]/file
  // depth 2 구조 (백워드 호환): [project]/file
  getProjectName(filePath) {
    const parts = path.relative(this.watchDir, filePath).split(path.sep)
    return parts.length >= 2 ? parts[parts.length - 2] : null
  }

  getCategoryName(filePath) {
    const parts = path.relative(this.watchDir, filePath).split(path.sep)
    // depth 3 이상일 때만 1단계 폴더를 카테고리로 인식
    if (parts.length < 3) return null
    const raw = parts[0]
    const normalized = normalizeCategory(raw)
    // 기본 카테고리에 매칭되면 정규화된 값, 아니면 원본(커스텀 카테고리)
    return DEFAULT_CATEGORIES.includes(normalized) ? normalized : raw
  }

  getProjectKey(filePath) {
    const parts = path.relative(this.watchDir, filePath).split(path.sep)
    if (parts.length < 2) return null
    return parts.slice(0, -1).join('/')
  }

  async findOrCreateProject(name, projectKey, category) {
    if (this.projectCache.has(projectKey)) return this.projectCache.get(projectKey)

    const result = await this.api.findOrCreateProject(name, category)
    this.projectCache.set(projectKey, result.projectId)
    return result.projectId
  }

  async processImage(filePath) {
    const buffer = fs.readFileSync(filePath)
    const meta = await sharp(buffer, { failOn: 'none' }).metadata()

    if (buffer.length <= MAX_SIZE && meta.width <= MAX_DIM && meta.height <= MAX_DIM) {
      return { buffer, skipped: true, originalSize: buffer.length, compressedSize: buffer.length }
    }

    const result = await sharp(buffer, { failOn: 'none' })
      .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer()

    return { buffer: result, skipped: false, originalSize: buffer.length, compressedSize: result.length }
  }

  async uploadToStorage(buffer, storagePath, contentType) {
    return this.api.uploadFile(buffer, storagePath, contentType)
  }

  async uploadToBunny(buffer, fileName, projectId, assetId, relPath) {
    try {
      // 1. Create Bunny video + get TUS auth from backend
      const { videoId, tusAuth, embedUrl } = await this.api.createBunnyVideo(`${projectId}_${fileName}`)

      this.onFileStatus({ path: relPath, status: 'uploading', progress: 50, fileName, isVideo: true, size: fmt(buffer.length), phase: 'Bunny 업로드 중...' })

      // 2. Upload via TUS protocol (direct to Bunny, no API key needed)
      await this.api.tusUpload(buffer, videoId, tusAuth)

      // 3. Update asset with Bunny info
      await this.api.updateAsset(assetId, {
        videoHost: 'bunny',
        bunnyVideoId: videoId,
        embedUrl,
        bunnyStatus: 'processing',
        bunnyUploadedAt: new Date().toISOString(),
      })

      // Start background polling for encoding completion
      this.pollBunnyEncoding(videoId, assetId, projectId, fileName)

      return { bunnyVideoId: videoId, embedUrl }
    } catch (err) {
      console.error('[Bunny] Upload failed for', fileName, err.message)
      return null
    }
  }

  async pollBunnyEncoding(bunnyVideoId, assetId, projectId, fileName) {
    const maxAttempts = 60 // max 30 min (30s interval)
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 30000))

      try {
        const { status } = await this.api.checkBunnyStatus(bunnyVideoId)

        if (status === 4) {
          // Encoding complete → save thumbnail via backend
          try {
            const { thumbnailUrl } = await this.api.saveBunnyThumbnail(bunnyVideoId, projectId)

            await this.api.updateAsset(assetId, {
              bunnyStatus: 'ready',
              videoThumbnailUrl: thumbnailUrl,
              bunnyEncodedAt: new Date().toISOString(),
            })

            // Update project thumbnail if needed
            const project = await this.api.getProject(projectId)
            if (project && !project.thumbnailUrl) {
              await this.api.updateProject(projectId, { thumbnailUrl })
            }

            console.log(`[Bunny] ${fileName} encoding complete, thumbnail saved`)
          } catch (thumbErr) {
            await this.api.updateAsset(assetId, { bunnyStatus: 'ready' })
            console.log(`[Bunny] ${fileName} encoding complete (thumbnail save failed)`)
          }
          return
        } else if (status === 5) {
          await this.api.updateAsset(assetId, {
            bunnyStatus: 'error',
            bunnyError: 'Encoding failed',
          })
          console.log(`[Bunny] ${fileName} encoding failed`)
          return
        }
      } catch (err) {
        console.error(`[Bunny] Polling error for ${fileName}:`, err.message)
      }
    }
  }

  async syncFile(filePath) {
    const projectName = this.getProjectName(filePath)
    if (!projectName) return

    const relPath = this.getRelPath(filePath)
    if (this.state.syncedFiles[relPath]) return

    const fileName = path.basename(filePath)
    const contentType = guessContentType(fileName)
    const isVid = isVideo(fileName)
    const isImg = isImage(fileName)
    if (!isImg && !isVid) return

    // New folder detection
    const projectKey = this.getProjectKey(filePath)
    if (this._ready && projectKey && !this.approvedFolders.has(projectKey)) {
      if (this.deniedFolders.has(projectKey)) {
        const pending = this.pendingFolders.get(projectKey)
        if (pending) {
          const folderPath = path.join(this.watchDir, ...projectKey.split('/'))
          try {
            const entries = fs.readdirSync(folderPath)
            pending.fileCount = entries.filter(e => isSupported(e)).length
          } catch {}
        }
        return
      }

      const alreadySynced = Object.keys(this.state.syncedFiles).some(k => k.startsWith(projectKey + '/'))
      if (!alreadySynced) {
        const folderPath = path.join(this.watchDir, ...projectKey.split('/'))
        let fileCount = 0
        try {
          const entries = fs.readdirSync(folderPath)
          fileCount = entries.filter(e => isSupported(e)).length
        } catch {}

        const approved = await this.onNewFolder({ name: projectName, path: projectKey, fileCount })
        if (!approved) {
          this.deniedFolders.add(projectKey)
          this.pendingFolders.set(projectKey, {
            name: projectName, path: projectKey, fileCount,
            addedAt: new Date().toISOString(),
          })
          return
        }
        this.approvedFolders.add(projectKey)
      } else {
        this.approvedFolders.add(projectKey)
      }
    }

    this.onFileStatus({ path: relPath, status: 'uploading', progress: 0, fileName, isVideo: isVid })

    try {
      const projectKey = this.getProjectKey(filePath)
      const category = this.getCategoryName(filePath)
      const projectId = await this.findOrCreateProject(projectName, projectKey, category)
      let buffer, originalSize, compressedSize

      if (isImg) {
        const result = await this.processImage(filePath)
        buffer = result.buffer
        originalSize = result.originalSize
        compressedSize = result.compressedSize
      } else {
        buffer = fs.readFileSync(filePath)
        originalSize = buffer.length
        compressedSize = buffer.length
      }

      const sizeStr = `${fmt(originalSize)}${isImg && originalSize !== compressedSize ? '\u2192' + fmt(compressedSize) : ''}`
      this.onFileStatus({ path: relPath, status: 'uploading', progress: 10, fileName, isVideo: isVid, size: sizeStr })

      const storagePath = `users/${this.uid}/projects/${projectId}/${Date.now()}_${fileName}`

      // Video: create Firestore doc first
      let assetId
      if (isVid) {
        const { assetId: aid } = await this.api.createAsset({
          uid: this.uid, projectId, fileName, fileSize: compressedSize,
          fileType: contentType, isVideo: true, url: '', storagePath,
          createdAt: new Date().toISOString(),
        })
        assetId = aid
        this.onFileStatus({ path: relPath, status: 'uploading', progress: 20, fileName, isVideo: isVid, size: sizeStr })
      }

      // Upload to Firebase Storage via signed URL
      const url = await this.uploadToStorage(buffer, storagePath, contentType)
      this.onFileStatus({ path: relPath, status: 'uploading', progress: 40, fileName, isVideo: isVid, size: sizeStr })

      if (isVid) {
        await this.api.updateAsset(assetId, { url })

        // Upload to Bunny via TUS (no API key on client)
        await this.uploadToBunny(buffer, fileName, projectId, assetId, relPath)
        this.onFileStatus({ path: relPath, status: 'uploading', progress: 90, fileName, isVideo: isVid, size: sizeStr })
      } else {
        const { assetId: aid } = await this.api.createAsset({
          uid: this.uid, projectId, fileName, fileSize: compressedSize,
          fileType: contentType, isVideo: false, url, storagePath,
          createdAt: new Date().toISOString(),
        })
        assetId = aid
      }

      // Update project counters
      const project = await this.api.getProject(projectId)
      const updates = {
        _increments: { [isVid ? 'videoCount' : 'imageCount']: 1 },
      }
      if (project && !project.thumbnailUrl && !isVid) {
        updates.thumbnailUrl = url
      }
      await this.api.updateProject(projectId, updates)

      // Record in state
      this.state.syncedFiles[relPath] = { assetId, projectId, storagePath, syncedAt: new Date().toISOString() }
      this.saveState()
      this.failedFiles.delete(relPath)

      this.onFileStatus({ path: relPath, status: 'done', progress: 100, fileName, isVideo: isVid, size: sizeStr })
    } catch (err) {
      this.failedFiles.set(relPath, filePath)
      this.onFileStatus({ path: relPath, status: 'failed', progress: 0, fileName, isVideo: isVid, error: err.message })
    }
  }

  getPendingFolders() {
    return [...this.pendingFolders.entries()].map(([key, data]) => {
      const folderPath = path.join(this.watchDir, ...key.split('/'))
      try {
        const entries = fs.readdirSync(folderPath)
        data.fileCount = entries.filter(e => isSupported(e)).length
      } catch {}
      return { key, ...data }
    })
  }

  async approvePendingFolder(projectKey) {
    this.deniedFolders.delete(projectKey)
    this.approvedFolders.add(projectKey)
    this.pendingFolders.delete(projectKey)

    const folderPath = path.join(this.watchDir, ...projectKey.split('/'))
    try {
      const entries = fs.readdirSync(folderPath)
      for (const entry of entries) {
        const filePath = path.join(folderPath, entry)
        const stat = fs.statSync(filePath)
        if (stat.isFile() && isSupported(entry)) {
          await this.syncFile(filePath)
        }
      }
    } catch (err) {
      this.onError({ message: `Upload failed: ${projectKey}`, error: err.message })
    }
  }

  removePendingFolder(projectKey) {
    this.deniedFolders.delete(projectKey)
    this.pendingFolders.delete(projectKey)
  }

  getSyncedFolders() {
    const folderMap = new Map()
    for (const [relPath, entry] of Object.entries(this.state.syncedFiles)) {
      const parts = relPath.split('/')
      if (parts.length < 2) continue
      const key = parts.slice(0, -1).join('/')
      const name = parts[parts.length - 2]
      if (!folderMap.has(key)) {
        folderMap.set(key, { key, name, path: key, fileCount: 0, projectId: entry.projectId })
      }
      folderMap.get(key).fileCount++
    }

    const result = []
    for (const [key, data] of folderMap) {
      const folderPath = path.join(this.watchDir, ...key.split('/'))
      if (fs.existsSync(folderPath)) {
        result.push(data)
      }
    }
    return result
  }

  async resyncFolder(projectKey) {
    for (const relPath of Object.keys(this.state.syncedFiles)) {
      if (relPath.startsWith(projectKey + '/')) {
        delete this.state.syncedFiles[relPath]
      }
    }
    this.saveState()
    this.projectCache.delete(projectKey)

    const folderPath = path.join(this.watchDir, ...projectKey.split('/'))
    try {
      const entries = fs.readdirSync(folderPath)
      for (const entry of entries) {
        const filePath = path.join(folderPath, entry)
        const stat = fs.statSync(filePath)
        if (stat.isFile() && isSupported(entry)) {
          await this.syncFile(filePath)
        }
      }
    } catch (err) {
      this.onError({ message: `Re-upload failed: ${projectKey}`, error: err.message })
    }
  }

  async deleteSyncedFolder(projectKey) {
    const entries = Object.entries(this.state.syncedFiles)
      .filter(([relPath]) => relPath.startsWith(projectKey + '/'))

    let projectId = null
    for (const [relPath, entry] of entries) {
      projectId = entry.projectId
      try { await this.api.deleteFile(entry.storagePath) } catch {}
      try { await this.api.deleteAsset(entry.assetId) } catch {}
      delete this.state.syncedFiles[relPath]
    }

    if (projectId) {
      try { await this.api.deleteProject(projectId) } catch {}
    }

    this.projectCache.delete(projectKey)
    this.saveState()
  }

  async retryFile(relPath) {
    const filePath = this.failedFiles.get(relPath)
    if (!filePath) return
    delete this.state.syncedFiles[relPath]
    this.failedFiles.delete(relPath)
    await this.syncFile(filePath)
  }

  async retryAllFailed() {
    const failed = [...this.failedFiles.entries()]
    for (const [relPath, filePath] of failed) {
      delete this.state.syncedFiles[relPath]
      this.failedFiles.delete(relPath)
      await this.syncFile(filePath)
    }
  }

  async syncStateWithServer() {
    this.onProgress({ phase: 'scanning', total: 0, completed: 0 })

    // Get all projects for this user from backend
    const { projects } = await this.api.getProjectsByUid()

    const serverProjects = new Map()
    for (const proj of projects) {
      serverProjects.set(proj.name, { id: proj.id, name: proj.name })
    }

    // Scan local folders
    const localFolders = new Map()
    const scanDir = (dir, depth = 0) => {
      if (depth > 5) return
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const e of entries) {
          if (e.name.startsWith('.') || isIgnored(e.name)) continue
          const full = path.join(dir, e.name)
          if (e.isDirectory()) {
            scanDir(full, depth + 1)
          } else if (e.isFile() && isSupported(e.name)) {
            const rel = path.relative(this.watchDir, full)
            const parts = rel.split(path.sep)
            if (parts.length < 2) continue
            const key = parts.slice(0, -1).join('/')
            const name = parts[parts.length - 2]
            if (!localFolders.has(key)) {
              localFolders.set(key, { name, files: [] })
            }
            localFolders.get(key).files.push({ full, fileName: e.name, relPath: parts.join('/') })
          }
        }
      } catch {}
    }
    scanDir(this.watchDir)

    // Match local folders with server projects, rebuild sync state
    for (const [key, folder] of localFolders) {
      const sp = serverProjects.get(folder.name)
      if (!sp) continue

      this.projectCache.set(key, sp.id)
      this.approvedFolders.add(key)

      // Get assets for this project from backend
      const { assets } = await this.api.getAssetsByProject(sp.id)
      const serverFiles = new Set()
      const assetMap = new Map()
      for (const asset of assets) {
        serverFiles.add(asset.fileName)
        assetMap.set(asset.fileName, { assetId: asset.id, storagePath: asset.storagePath || '' })
      }

      for (const f of folder.files) {
        if (serverFiles.has(f.fileName) && !this.state.syncedFiles[f.relPath]) {
          const info = assetMap.get(f.fileName)
          this.state.syncedFiles[f.relPath] = {
            assetId: info.assetId,
            projectId: sp.id,
            storagePath: info.storagePath,
          }
        }
      }
    }

    this.saveState()
  }

  async start() {
    await this.syncStateWithServer()

    const initialFiles = []

    this.watcher = chokidar.watch(this.watchDir, {
      persistent: true,
      ignoreInitial: false,
      depth: 5,
      awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 200 },
      ignored: (p) => {
        const name = p.split(/[/\\]/).pop()
        return name.startsWith('.') || isIgnored(name)
      },
    })

    await new Promise((resolve) => {
      this.watcher.on('add', (p) => {
        if (!isSupported(p)) return
        if (!this._ready) { initialFiles.push(p); return }
        this.syncFile(p)
      })

      this.watcher.on('unlink', (p) => {
        if (!isSupported(p)) return
        this.handleDelete(p)
      })

      this.watcher.on('unlinkDir', () => {
        this.onFolderRemoved()
      })

      this.watcher.on('ready', async () => {
        this._ready = true
        this.onProgress({ phase: 'scanning', total: initialFiles.length, completed: 0 })

        for (let i = 0; i < initialFiles.length; i++) {
          await this.syncFile(initialFiles[i])
          this.onProgress({ phase: 'syncing', total: initialFiles.length, completed: i + 1 })
        }

        this.onProgress({ phase: 'watching', total: initialFiles.length, completed: initialFiles.length })
        resolve()
      })
    })
  }

  async handleDelete(filePath) {
    const relPath = this.getRelPath(filePath)
    const entry = this.state.syncedFiles[relPath]
    if (!entry) return

    try {
      try { await this.api.deleteFile(entry.storagePath) } catch {}
      await this.api.deleteAsset(entry.assetId)

      const isVid = /\.(mp4|mov|avi|mkv|webm|m4v|wmv|flv)$/i.test(entry.storagePath)
      await this.api.updateProject(entry.projectId, {
        _increments: { [isVid ? 'videoCount' : 'imageCount']: -1 },
      })

      delete this.state.syncedFiles[relPath]
      this.saveState()
      this.onFileStatus({ path: relPath, status: 'deleted', fileName: path.basename(filePath) })
    } catch (err) {
      this.onError({ message: `Delete failed: ${relPath}`, error: err.message })
    }
  }

  stop() {
    this.watcher?.close()
    this.saveState()
  }
}

module.exports = { SyncEngine }

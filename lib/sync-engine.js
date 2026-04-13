// ASSI Sync Engine v2 — Secure edition
// No more Firebase Admin SDK or hardcoded API keys
// All operations go through the Vercel API backend

const chokidar = require('chokidar')
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')
const os = require('os')

// ffmpeg / ffprobe 경로 (패키징 후에도 동작하도록 .replace 처리)
const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked')
const ffprobePath = require('ffprobe-static').path.replace('app.asar', 'app.asar.unpacked')


const MAX_DIM = 2048
const MAX_SIZE = 7 * 1024 * 1024
const JPEG_QUALITY = 92
const VIDEO_MAX_DIM = 3840  // 4K 한계 — Bunny Stream 최대 지원

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
    this.batchingFolders = new Set() // 배치 처리 중인 폴더 (중복 방지)
    this.watcher = null
    this.state = { syncedFiles: {} }
    this.failedFiles = new Map()
    this.projectCache = new Map()
    this._ready = false

    // ── Rename detection buffers ──
    this.pendingUnlinks = new Map()   // relPath → { filePath, size, projectKey, timer }
    this.pendingUnlinkDirs = new Map() // folderKey → { folderPath, parentKey, timer }

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

  // 폴더 구조: [카테고리]/...[프로젝트]/파일
  // 1차 폴더 = 항상 카테고리, 1차 직속 파일은 무시
  // 파일의 직속 부모 폴더 = 프로젝트 (2차든 3차든 최종 폴더가 프로젝트)
  // 예: BEAUTY/Nike/Campaign1/img.jpg → 카테고리=BEAUTY, 프로젝트=Campaign1
  //     BEAUTY/Solo/img.jpg           → 카테고리=BEAUTY, 프로젝트=Solo
  getProjectName(filePath) {
    const parts = path.relative(this.watchDir, filePath).split(path.sep)
    // 1차 직속 파일(카테고리/파일) → 무시
    if (parts.length < 3) return null
    // 파일의 직속 부모 폴더명 = 프로젝트명
    return parts[parts.length - 2]
  }

  getCategoryName(filePath) {
    const parts = path.relative(this.watchDir, filePath).split(path.sep)
    if (parts.length < 3) return null
    const raw = parts[0]
    const normalized = normalizeCategory(raw)
    return DEFAULT_CATEGORIES.includes(normalized) ? normalized : raw
  }

  getProjectKey(filePath) {
    const parts = path.relative(this.watchDir, filePath).split(path.sep)
    if (parts.length < 3) return null
    // 파일명 제외한 전체 경로 = 프로젝트 고유 키
    // 예: BEAUTY/Nike/Campaign1 (같은 폴더의 파일은 같은 프로젝트)
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

  /**
   * 영상 해상도 체크 → 4K 초과 시 ffmpeg로 리사이즈
   * @returns {{ outputPath: string, width: number, height: number, resized: boolean, originalSize: number, compressedSize: number }}
   */
  async processVideo(filePath, relPath, fileName) {
    // 1) ffprobe로 해상도 확인
    const probe = await new Promise((resolve, reject) => {
      execFile(ffprobePath, [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-select_streams', 'v:0',
        filePath,
      ], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(err)
        try { resolve(JSON.parse(stdout)) } catch (e) { reject(e) }
      })
    })

    const stream = probe.streams && probe.streams[0]
    if (!stream) throw new Error('영상 스트림을 찾을 수 없습니다')

    const w = stream.width
    const h = stream.height
    const stat = fs.statSync(filePath)
    const originalSize = stat.size

    console.log(`[Video] ${fileName}: ${w}×${h}, ${(originalSize / 1024 / 1024).toFixed(1)}MB`)

    // 2) 4K 이하면 리사이즈 불필요
    if (w <= VIDEO_MAX_DIM && h <= VIDEO_MAX_DIM) {
      return { outputPath: filePath, width: w, height: h, resized: false, originalSize, compressedSize: originalSize }
    }

    // 3) 4K 초과 → ffmpeg 리사이즈
    console.log(`[Video] ${fileName}: ${w}×${h} → 4K 리사이즈 필요`)
    this.onFileStatus({ path: relPath, status: 'uploading', progress: 5, fileName, isVideo: true, phase: '영상 리사이즈 중...' })

    // 비율 유지하면서 긴 변을 3840으로 축소, 홀수 해상도 방지 (divisible by 2)
    const scale = w >= h
      ? `${VIDEO_MAX_DIM}:-2`   // 가로가 더 길면 가로를 3840으로
      : `-2:${VIDEO_MAX_DIM}`   // 세로가 더 길면 세로를 3840으로

    const tmpDir = os.tmpdir()
    const outputPath = path.join(tmpDir, `assi_resize_${Date.now()}_${fileName}`)

    await new Promise((resolve, reject) => {
      const args = [
        '-i', filePath,
        '-vf', `scale=${scale}`,
        '-c:v', 'libx264',
        '-crf', '18',           // 거의 무손실급 품질
        '-preset', 'medium',    // 속도-품질 균형
        '-c:a', 'aac',          // 오디오 AAC로 통일
        '-b:a', '192k',
        '-movflags', '+faststart',  // 웹 스트리밍 최적화
        '-y',                   // 덮어쓰기
        outputPath,
      ]

      console.log(`[Video] ffmpeg 리사이즈 시작: ${w}×${h} → scale=${scale}`)
      const proc = execFile(ffmpegPath, args, { maxBuffer: 10 * 1024 * 1024 }, (err) => {
        if (err) return reject(err)
        resolve()
      })

      // ffmpeg stderr로 진행 상태 로깅
      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          const line = data.toString().trim()
          if (line.includes('frame=')) {
            console.log(`[ffmpeg] ${line.substring(0, 80)}`)
          }
        })
      }
    })

    const outStat = fs.statSync(outputPath)
    console.log(`[Video] ${fileName}: 리사이즈 완료 ${(originalSize / 1024 / 1024).toFixed(1)}MB → ${(outStat.size / 1024 / 1024).toFixed(1)}MB`)

    return { outputPath, width: w, height: h, resized: true, originalSize, compressedSize: outStat.size }
  }

  async uploadToBunny(bufferOrPath, fileName, projectId, assetId, relPath, fileSize) {
    try {
      // 1. Create Bunny video + get TUS auth from backend
      const { videoId, tusAuth, embedUrl } = await this.api.createBunnyVideo(`${projectId}_${fileName}`)

      const displaySize = fileSize ? fmt(fileSize) : (typeof bufferOrPath === 'string' ? '' : fmt(bufferOrPath.length))
      this.onFileStatus({ path: relPath, status: 'uploading', progress: 50, fileName, isVideo: true, size: displaySize, phase: 'Bunny 업로드 중...' })

      // 2. Upload via TUS protocol (chunked for large files, single PATCH for small)
      await this.api.tusUpload(bufferOrPath, videoId, tusAuth, fileSize)

      // 3. Update asset with Bunny info
      await this.api.updateAsset(assetId, {
        videoHost: 'bunny',
        bunnyVideoId: videoId,
        embedUrl,
        bunnyStatus: 'processing',
        bunnyUploadedAt: new Date().toISOString(),
      })

      return { bunnyVideoId: videoId, embedUrl }
    } catch (err) {
      console.error('[Bunny] Upload failed for', fileName, err.message)
      return null
    }
  }

  // 기존 호환용 (백그라운드 폴링) — 더 이상 사용 안 함
  async pollBunnyEncoding(bunnyVideoId, assetId, projectId, fileName) {
    return this.pollBunnyEncodingAwait(assetId, projectId, fileName, null, null)
  }

  // 영상 인코딩 완료까지 대기 — done/failed 상태를 직접 리턴
  async pollBunnyEncodingAwait(assetId, projectId, fileName, relPath, sizeStr) {
    const bunnyVideoId = this._lastBunnyVideoId
    if (!bunnyVideoId) {
      console.error(`[Bunny] No bunnyVideoId for asset ${assetId}`)
      if (relPath) this.onFileStatus({ path: relPath, status: 'done', progress: 100, fileName, isVideo: true, size: sizeStr || '' })
      return
    }

    const maxAttempts = 120 // max 60 min (30s interval)
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 30000))

      // 진행 상태 업데이트
      if (relPath) {
        const mins = Math.floor((i + 1) * 0.5)
        this.onFileStatus({ path: relPath, status: 'encoding', progress: Math.min(95, 92 + i * 0.1), fileName, isVideo: true, size: sizeStr || '', phase: `인코딩 중... (${mins}분 경과)` })
      }

      try {
        const { status } = await this.api.checkBunnyStatus(bunnyVideoId)

        if (status === 4) {
          // Encoding complete → save thumbnail
          try {
            const { thumbnailUrl } = await this.api.saveBunnyThumbnail(bunnyVideoId, projectId)
            await this.api.updateAsset(assetId, {
              bunnyStatus: 'ready',
              videoThumbnailUrl: thumbnailUrl,
              bunnyEncodedAt: new Date().toISOString(),
            })
            const project = await this.api.getProject(projectId)
            if (project && !project.thumbnailUrl) {
              await this.api.updateProject(projectId, { thumbnailUrl })
            }
            console.log(`[Bunny] ${fileName} encoding complete, thumbnail saved`)
          } catch (thumbErr) {
            await this.api.updateAsset(assetId, { bunnyStatus: 'ready' })
            console.log(`[Bunny] ${fileName} encoding complete (thumbnail save failed)`)
          }
          if (relPath) this.onFileStatus({ path: relPath, status: 'done', progress: 100, fileName, isVideo: true, size: sizeStr || '' })
          return
        } else if (status === 5) {
          await this.api.updateAsset(assetId, { bunnyStatus: 'error', bunnyError: 'Encoding failed' })
          console.log(`[Bunny] ${fileName} encoding failed`)
          if (relPath) this.onFileStatus({ path: relPath, status: 'failed', progress: 0, fileName, isVideo: true, error: '인코딩 실패' })
          return
        }
      } catch (err) {
        console.error(`[Bunny] Polling error for ${fileName}:`, err.message)
      }
    }

    // 타임아웃 — 60분 넘으면 일단 done 처리 (Bunny에서 나중에 완료될 수 있음)
    console.log(`[Bunny] ${fileName} encoding timeout (60min), marking done`)
    if (relPath) this.onFileStatus({ path: relPath, status: 'done', progress: 100, fileName, isVideo: true, size: sizeStr || '' })
  }

  async syncFile(filePath, _fromBatch = false) {
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

    // 배치 처리 중인 폴더의 파일: 배치 호출이 아니면 스킵 (중복 방지)
    if (this._ready && projectKey && this.batchingFolders.has(projectKey) && !_fromBatch) return

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

        // 새 폴더 자동 승인 → 폴더 안의 모든 파일을 알파벳 순으로 정렬해 일괄 처리
        // (1번 파일이 자동으로 썸네일이 됨)
        this.batchingFolders.add(projectKey)
        try {
          const folderFiles = []
          try {
            const entries = fs.readdirSync(folderPath)
            for (const e of entries) {
              if (isSupported(e)) folderFiles.push(path.join(folderPath, e))
            }
            folderFiles.sort((a, b) => a.localeCompare(b))
          } catch {}
          for (const f of folderFiles) {
            await this.syncFile(f, true)
          }
        } finally {
          this.batchingFolders.delete(projectKey)
        }
        return
      } else {
        this.approvedFolders.add(projectKey)
      }
    }

    this.onFileStatus({ path: relPath, status: 'uploading', progress: 0, fileName, isVideo: isVid })

    let videoFilePath = filePath  // 영상: 리사이즈된 경로 (또는 원본)
    let videoResized = false

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
        // Video: 해상도 체크 → 4K 초과 시 ffmpeg 리사이즈
        try {
          const result = await this.processVideo(filePath, relPath, fileName)
          videoFilePath = result.outputPath
          videoResized = result.resized
          originalSize = result.originalSize
          compressedSize = result.compressedSize
        } catch (probeErr) {
          console.warn(`[Video] processVideo 실패, 원본 사용: ${probeErr.message}`)
          const stat = fs.statSync(filePath)
          originalSize = stat.size
          compressedSize = stat.size
        }
      }

      const sizeStr = `${fmt(originalSize)}${(isImg || videoResized) && originalSize !== compressedSize ? '\u2192' + fmt(compressedSize) : ''}`
      this.onFileStatus({ path: relPath, status: 'uploading', progress: 10, fileName, isVideo: isVid, size: sizeStr })

      const storagePath = `users/${this.uid}/projects/${projectId}/${Date.now()}_${fileName}`

      // Video: create Firestore doc first
      let assetId
      if (isVid) {
        const { assetId: aid } = await this.api.createAsset({
          uid: this.uid, projectId, fileName, fileSize: originalSize,
          fileType: contentType, isVideo: true, url: '', storagePath,
          createdAt: new Date().toISOString(),
        })
        assetId = aid
        this.onFileStatus({ path: relPath, status: 'uploading', progress: 20, fileName, isVideo: isVid, size: sizeStr })
      }

      // Upload to Firebase Storage via signed URL (stream for video, buffer for image)
      // 영상은 원본을 Storage에 올림 (원본 공유용), Bunny에만 리사이즈본 사용
      const url = isVid
        ? await this.api.uploadFileStream(filePath, storagePath, contentType, originalSize)
        : await this.uploadToStorage(buffer, storagePath, contentType)
      this.onFileStatus({ path: relPath, status: 'uploading', progress: 40, fileName, isVideo: isVid, size: sizeStr })

      if (isVid) {
        await this.api.updateAsset(assetId, { url })

        // Upload to Bunny via TUS — chunked (50MB at a time, not whole file in memory)
        const bunnyResult = await this.uploadToBunny(videoFilePath, fileName, projectId, assetId, relPath, compressedSize)
        this._lastBunnyVideoId = bunnyResult?.bunnyVideoId || null
        this.onFileStatus({ path: relPath, status: 'encoding', progress: 90, fileName, isVideo: isVid, size: sizeStr, phase: '인코딩 대기 중...' })
      } else {
        const { assetId: aid } = await this.api.createAsset({
          uid: this.uid, projectId, fileName, fileSize: compressedSize,
          originalSize: originalSize, // 원본 파일 크기 (무압축 공유용)
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

      if (isVid) {
        // 영상: 인코딩 완료까지 대기 후 done 처리
        this.onFileStatus({ path: relPath, status: 'encoding', progress: 92, fileName, isVideo: isVid, size: sizeStr, phase: '영상 인코딩 중...' })
        await this.pollBunnyEncodingAwait(assetId, projectId, fileName, relPath, sizeStr)
      } else {
        this.onFileStatus({ path: relPath, status: 'done', progress: 100, fileName, isVideo: isVid, size: sizeStr })
      }
    } catch (err) {
      this.failedFiles.set(relPath, filePath)
      this.onFileStatus({ path: relPath, status: 'failed', progress: 0, fileName, isVideo: isVid, error: err.message })
    } finally {
      // 리사이즈된 임시파일 정리
      if (videoResized && videoFilePath !== filePath) {
        try { fs.unlinkSync(videoFilePath) } catch (_) {}
      }
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

  // 전체 폴더 재스캔 — 누락된 파일 찾아서 다시 업로드
  async rescan() {
    if (!this.watchDir) return

    const allFiles = []
    const scanDir = (dir, depth = 0) => {
      if (depth > 5) return
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const e of entries) {
          if (e.name.startsWith('.') || isIgnored(e.name)) continue
          const full = path.join(dir, e.name)
          if (e.isDirectory()) { scanDir(full, depth + 1); continue }
          if (isSupported(full)) allFiles.push(full)
        }
      } catch {}
    }
    scanDir(this.watchDir)
    // syncedFiles에 없는 것 + 실패한 것 재시도
    const unsyncedFiles = allFiles.filter(f => {
      const rel = this.getRelPath(f)
      return !this.state.syncedFiles[rel]
    })
    const failed = [...this.failedFiles.entries()]

    const total = unsyncedFiles.length + failed.length
    if (total === 0) {
      this.onProgress({ phase: 'watching', total: Object.keys(this.state.syncedFiles).length, completed: Object.keys(this.state.syncedFiles).length })
      return
    }

    this.onProgress({ phase: 'scanning', total, completed: 0 })

    let i = 0
    for (const filePath of unsyncedFiles) {
      await this.syncFile(filePath)
      i++
      this.onProgress({ phase: 'syncing', total, completed: i })
    }
    for (const [relPath, filePath] of failed) {
      delete this.state.syncedFiles[relPath]
      this.failedFiles.delete(relPath)
      await this.syncFile(filePath)
      i++
      this.onProgress({ phase: 'syncing', total, completed: i })
    }

    this.onProgress({ phase: 'watching', total: Object.keys(this.state.syncedFiles).length, completed: Object.keys(this.state.syncedFiles).length })
  }

  async syncStateWithServer() {
    this.onProgress({ phase: 'scanning', total: 0, completed: 0 })

    // Get all projects for this user from backend
    const { projects } = await this.api.getProjectsByUid()

    const serverProjects = new Map()
    for (const proj of projects) {
      serverProjects.set(proj.name, { id: proj.id, name: proj.name, category: proj.category })
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

      // depth 3 카테고리 동기화: 폴더 구조에서 카테고리 추출 후 서버 업데이트
      const parts = key.split('/')
      if (parts.length >= 2) {
        const rawCat = parts[0]
        const norm = normalizeCategory(rawCat)
        const category = DEFAULT_CATEGORIES.includes(norm) ? norm : rawCat
        if (sp.category !== category) {
          try {
            await this.api.updateProject(sp.id, { category })
          } catch {}
        }
      }

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
        // Check if this is a rename (matching a pending unlink)
        if (this.tryMatchRename(p)) return
        this.syncFile(p)
      })

      this.watcher.on('addDir', (p) => {
        if (!this._ready) return
        this.tryMatchFolderRename(p)
      })

      this.watcher.on('unlink', (p) => {
        if (!isSupported(p)) return
        this.bufferUnlink(p)
      })

      this.watcher.on('unlinkDir', (p) => {
        this.bufferUnlinkDir(p)
      })

      this.watcher.on('ready', async () => {
        this._ready = true
        // 폴더별 그룹핑 후 파일명 알파벳 순 정렬 → 1번이 썸네일 됨
        initialFiles.sort((a, b) => a.localeCompare(b))
        this.onProgress({ phase: 'scanning', total: initialFiles.length, completed: 0 })

        for (let i = 0; i < initialFiles.length; i++) {
          await this.syncFile(initialFiles[i])
          this.onProgress({ phase: 'syncing', total: initialFiles.length, completed: i + 1 })
        }

        this.onProgress({ phase: 'watching', total: initialFiles.length, completed: initialFiles.length })

        // 무압축 공유 업로드 폴링 시작
        this.startSharePolling()

        resolve()
      })
    })
  }

  // ── Rename Detection ──

  bufferUnlink(filePath) {
    const relPath = this.getRelPath(filePath)
    const entry = this.state.syncedFiles[relPath]
    if (!entry) return // not synced, nothing to do

    const projectKey = this.getProjectKey(filePath)
    const isVid = isVideo(filePath)

    const timer = setTimeout(() => {
      // No matching add arrived → proceed with normal delete
      this.pendingUnlinks.delete(relPath)
      this.handleDelete(filePath)
    }, 3500) // awaitWriteFinish(2000ms) + 여유분

    this.pendingUnlinks.set(relPath, { filePath, projectKey, isVideo: isVid, entry, timer })
  }

  tryMatchRename(newFilePath) {
    const newProjectKey = this.getProjectKey(newFilePath)
    if (!newProjectKey) return false

    const newIsVideo = isVideo(newFilePath)

    // Find a pending unlink in the same folder with same media type (image↔image, video↔video)
    for (const [oldRelPath, pending] of this.pendingUnlinks) {
      if (pending.projectKey !== newProjectKey) continue
      if (pending.isVideo !== newIsVideo) continue // must be same type

      // Found a rename match!
      clearTimeout(pending.timer)
      this.pendingUnlinks.delete(oldRelPath)
      this.handleFileRename(oldRelPath, newFilePath, pending.entry)
      return true
    }
    return false
  }

  async handleFileRename(oldRelPath, newFilePath, oldEntry) {
    const newRelPath = this.getRelPath(newFilePath)
    const newFileName = path.basename(newFilePath)
    const oldFileName = path.basename(oldRelPath)

    console.log(`[Rename] File: ${oldFileName} → ${newFileName}`)

    try {
      // Update asset fileName in Firestore (storagePath stays the same — it's an internal key)
      await this.api.updateAsset(oldEntry.assetId, {
        fileName: newFileName,
        updatedAt: new Date().toISOString(),
      })

      // Update local state: remove old relPath, add new one with same references
      delete this.state.syncedFiles[oldRelPath]
      this.state.syncedFiles[newRelPath] = { ...oldEntry, syncedAt: new Date().toISOString() }
      this.saveState()

      this.onFileStatus({ path: newRelPath, status: 'renamed', fileName: newFileName, oldFileName })
    } catch (err) {
      console.error(`[Rename] Failed: ${oldRelPath} → ${newRelPath}`, err.message)
      // Fallback: delete old asset, then sync the new file normally
      try {
        try { await this.api.deleteFile(oldEntry.storagePath) } catch {}
        await this.api.deleteAsset(oldEntry.assetId)
        const isVid = /\.(mp4|mov|avi|mkv|webm|m4v|wmv|flv)$/i.test(oldEntry.storagePath)
        await this.api.updateProject(oldEntry.projectId, {
          _increments: { [isVid ? 'videoCount' : 'imageCount']: -1 },
        })
        delete this.state.syncedFiles[oldRelPath]
        this.saveState()
      } catch {}
      this.syncFile(newFilePath)
    }
  }

  bufferUnlinkDir(dirPath) {
    const folderKey = path.relative(this.watchDir, dirPath).split(path.sep).join('/')
    if (!folderKey) return

    // Check if this folder has synced files (i.e., it's a known project folder)
    const hasSynced = Object.keys(this.state.syncedFiles).some(k => k.startsWith(folderKey + '/'))
    if (!hasSynced) {
      this.onFolderRemoved()
      return
    }

    const parts = folderKey.split('/')
    const parentKey = parts.length > 1 ? parts.slice(0, -1).join('/') : ''

    const timer = setTimeout(() => {
      // No matching addDir arrived → it's a real delete, not a rename
      this.pendingUnlinkDirs.delete(folderKey)
      this.onFolderRemoved()
    }, 4000) // 폴더 감지는 파일보다 여유 있게

    this.pendingUnlinkDirs.set(folderKey, { dirPath, parentKey, folderKey, timer })
  }

  tryMatchFolderRename(newDirPath) {
    const newFolderKey = path.relative(this.watchDir, newDirPath).split(path.sep).join('/')
    if (!newFolderKey) return

    const newParts = newFolderKey.split('/')
    const newParentKey = newParts.length > 1 ? newParts.slice(0, -1).join('/') : ''

    // Find a pending unlinkDir at the same depth/parent
    for (const [oldFolderKey, pending] of this.pendingUnlinkDirs) {
      if (pending.parentKey !== newParentKey) continue
      // Same parent directory → likely a rename
      clearTimeout(pending.timer)
      this.pendingUnlinkDirs.delete(oldFolderKey)
      this.handleFolderRename(oldFolderKey, newFolderKey)
      return
    }
  }

  async handleFolderRename(oldFolderKey, newFolderKey) {
    const oldName = oldFolderKey.split('/').pop()
    const newName = newFolderKey.split('/').pop()

    console.log(`[Rename] Folder: ${oldName} → ${newName}`)

    // Find projectId from synced files
    let projectId = this.projectCache.get(oldFolderKey)
    if (!projectId) {
      for (const [relPath, entry] of Object.entries(this.state.syncedFiles)) {
        if (relPath.startsWith(oldFolderKey + '/')) {
          projectId = entry.projectId
          break
        }
      }
    }

    if (!projectId) {
      console.error(`[Rename] No projectId found for folder: ${oldFolderKey}`)
      this.onFolderRemoved()
      return
    }

    try {
      // Update project name in Firestore
      const updateData = { name: newName }

      // If category (top-level folder) changed, update that too
      const newParts = newFolderKey.split('/')
      if (newParts.length >= 2) {
        const rawCat = newParts[0]
        const norm = normalizeCategory(rawCat)
        updateData.category = DEFAULT_CATEGORIES.includes(norm) ? norm : rawCat
      }

      await this.api.updateProject(projectId, updateData)

      // Update projectCache
      this.projectCache.delete(oldFolderKey)
      this.projectCache.set(newFolderKey, projectId)

      // Update approvedFolders
      this.approvedFolders.delete(oldFolderKey)
      this.approvedFolders.add(newFolderKey)

      // Update all syncedFiles entries with old folder prefix
      const updates = {}
      for (const [relPath, entry] of Object.entries(this.state.syncedFiles)) {
        if (relPath.startsWith(oldFolderKey + '/')) {
          const newRelPath = newFolderKey + relPath.slice(oldFolderKey.length)
          delete this.state.syncedFiles[relPath]
          updates[newRelPath] = { ...entry }
        }
      }
      Object.assign(this.state.syncedFiles, updates)
      this.saveState()

      console.log(`[Rename] Folder rename complete: ${oldName} → ${newName} (projectId: ${projectId})`)
      this.onFolderRemoved() // refresh UI
    } catch (err) {
      console.error(`[Rename] Folder rename failed: ${oldFolderKey} → ${newFolderKey}`, err.message)
      this.onFolderRemoved()
    }
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

  // ── 무압축 공유 업로드 ──

  async checkPendingShares() {
    try {
      const result = await this.api.getPendingShares()
      const shares = result?.shares || []
      if (shares.length > 0) {
        console.log(`[Share] Found ${shares.length} pending share(s)`)
        for (const share of shares) {
          await this.processShareUpload(share)
        }
      }
      return { found: shares.length }
    } catch (err) {
      console.error('[Share] Polling error:', err.message, err.stack)
      this.onProgress({ phase: 'share_error', message: err.message })
      return { error: err.message }
    }
  }

  async processShareUpload(share) {
    const assets = share.assets || []
    const pending = assets.filter(a => a.uploadStatus === 'pending')
    if (pending.length === 0) return

    console.log(`[Share] Processing share ${share.id}: ${pending.length} pending / ${assets.length} total, projectId=${share.projectId}`)

    let uploadedCount = assets.filter(a => a.uploadStatus === 'uploaded').length
    const total = assets.length
    const errors = []

    this.onProgress({ phase: 'share_uploading', total, completed: uploadedCount, shareId: share.id, projectName: share.projectName })

    for (const asset of pending) {
      // 파일 검색 단계
      this.onProgress({ phase: 'share_uploading', total, completed: uploadedCount, shareId: share.id, projectName: `${share.projectName} · ${asset.fileName} 검색 중` })

      const localPath = this.findLocalPath(asset.id, asset.fileName, share.projectId)
      if (!localPath) {
        const syncedCount = Object.keys(this.state.syncedFiles).length
        const err = `파일 없음: ${asset.fileName} (synced:${syncedCount})`
        console.error(`[Share] ${err}, assetId=${asset.id}, projectId=${share.projectId}`)
        errors.push(err)
        this.onProgress({ phase: 'share_uploading', total, completed: uploadedCount, shareId: share.id, projectName: `${share.projectName} · ❌ ${asset.fileName}` })
        continue
      }

      console.log(`[Share] Found ${asset.fileName} at ${localPath}`)

      try {
        const fileStat = fs.statSync(localPath)
        const fileSize = fileStat.size

        this.onProgress({ phase: 'share_uploading', total, completed: uploadedCount, shareId: share.id, projectName: `${share.projectName} · ${asset.fileName} 업로드 중 (${fmt(fileSize)})` })

        this.onFileStatus({
          path: `share/${share.id}/${asset.fileName}`,
          status: 'uploading',
          progress: 0,
          fileName: asset.fileName,
          isVideo: asset.isVideo,
          size: fmt(fileSize),
          phase: '무압축 업로드 중...',
        })

        // Firebase Storage로 업로드 (R2 presigned URL 대신 — 서명 호환 문제 우회)
        const fileBuffer = fs.readFileSync(localPath)
        const ext = path.extname(asset.fileName).toLowerCase().replace('.', '')
        const contentType = CONTENT_TYPE_MAP[ext] || 'application/octet-stream'
        console.log(`[Share] Storage upload ${asset.fileName} size=${fileSize} type=${contentType}`)

        // 1) Vercel API로 Storage signed upload URL 받기
        const shareStoragePath = asset.shareStoragePath
        if (!shareStoragePath) throw new Error('shareStoragePath 없음')

        const urlRes = await this.api.getStorageUploadUrl(shareStoragePath, contentType)
        if (!urlRes?.uploadUrl) throw new Error('Storage upload URL 발급 실패')

        // 2) Storage signed URL로 PUT 업로드
        const uploadResult = await new Promise((resolve, reject) => {
          const url = new URL(urlRes.uploadUrl)
          const https = require('https')
          const req = https.request({
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'PUT',
            headers: {
              'Content-Type': contentType,
              'Content-Length': fileBuffer.length,
              'x-goog-meta-firebasestoragedownloadtokens': urlRes.token,
            },
          }, (res) => {
            let body = ''
            res.on('data', chunk => body += chunk)
            res.on('end', () => resolve({ status: res.statusCode, body }))
          })
          req.on('error', reject)
          req.write(fileBuffer)
          req.end()
        })

        if (uploadResult.status >= 300) {
          throw new Error(`Storage ${uploadResult.status} ${uploadResult.body.slice(0, 100)}`)
        }

        uploadedCount++

        // Firestore 진행률 업데이트 (실제 원본 파일 크기로 보정)
        await this.api.updateShareProgress({
          shareId: share.id,
          assetId: asset.id,
          uploadStatus: 'uploaded',
          actualFileSize: fileSize, // 로컬 원본 크기 (압축 전)
          uploadedCount,
          status: uploadedCount === total ? 'ready' : undefined,
        })

        this.onFileStatus({
          path: `share/${share.id}/${asset.fileName}`,
          status: 'done',
          progress: 100,
          fileName: asset.fileName,
          isVideo: asset.isVideo,
          size: fmt(fileSize),
        })

        this.onProgress({ phase: 'share_uploading', total, completed: uploadedCount, shareId: share.id, projectName: share.projectName })
      } catch (err) {
        console.error(`[Share] Upload failed for ${asset.fileName}:`, err.message)
        errors.push(`${asset.fileName}: ${err.message}`)
        this.onFileStatus({
          path: `share/${share.id}/${asset.fileName}`,
          status: 'failed',
          fileName: asset.fileName,
          error: err.message,
        })
        this.onProgress({ phase: 'share_uploading', total, completed: uploadedCount, shareId: share.id, projectName: `${share.projectName} · ❌ ${err.message.slice(0, 40)}` })
      }
    }

    if (uploadedCount === total) {
      this.onProgress({ phase: 'share_complete', total, completed: total, shareId: share.id, projectName: share.projectName })
    } else {
      // 실패 정보를 UI에 표시
      const errMsg = errors.length > 0 ? errors[0] : '알 수 없는 오류'
      this.onProgress({ phase: 'share_error', message: errMsg })
      console.error(`[Share] Failed: ${uploadedCount}/${total} uploaded. Errors:`, errors)
      // 하나도 업로드 못 했으면 share를 failed로 마킹 (영구 루프 방지)
      if (uploadedCount === 0) {
        try {
          await this.api.updateShareProgress({ shareId: share.id, status: 'failed' })
        } catch {}
      }
    }
  }

  // assetId로 로컬 파일 경로 역추적
  findLocalPath(assetId, fileName, projectId) {
    // 1차: assetId로 정확히 매칭
    for (const [relPath, entry] of Object.entries(this.state.syncedFiles)) {
      if (entry.assetId === assetId) {
        const full = path.join(this.watchDir, ...relPath.split('/'))
        if (fs.existsSync(full)) return full
      }
    }
    // 2차: projectId + fileName으로 매칭 (assetId가 안 맞을 때 fallback)
    if (fileName && projectId) {
      for (const [relPath, entry] of Object.entries(this.state.syncedFiles)) {
        if (entry.projectId === projectId && relPath.endsWith('/' + fileName)) {
          const full = path.join(this.watchDir, ...relPath.split('/'))
          if (fs.existsSync(full)) {
            console.log(`[Share] Fallback match by fileName: ${fileName}`)
            return full
          }
        }
      }
    }
    // 3차: watchDir 전체에서 fileName으로 직접 검색
    if (fileName) {
      const searchDir = (dir, depth = 0) => {
        if (depth > 5) return null
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true })
          for (const e of entries) {
            if (e.name.startsWith('.')) continue
            const full = path.join(dir, e.name)
            if (e.isDirectory()) {
              const found = searchDir(full, depth + 1)
              if (found) return found
            } else if (e.name === fileName) {
              console.log(`[Share] Fallback match by file scan: ${full}`)
              return full
            }
          }
        } catch {}
        return null
      }
      return searchDir(this.watchDir)
    }
    return null
  }

  startSharePolling() {
    this._shareInterval = setInterval(() => this.checkPendingShares(), 10000) // 10초마다
  }

  stopSharePolling() {
    if (this._shareInterval) {
      clearInterval(this._shareInterval)
      this._shareInterval = null
    }
  }

  stop() {
    this.stopSharePolling()
    // Clear pending rename buffers
    for (const p of this.pendingUnlinks.values()) clearTimeout(p.timer)
    this.pendingUnlinks.clear()
    for (const p of this.pendingUnlinkDirs.values()) clearTimeout(p.timer)
    this.pendingUnlinkDirs.clear()
    this.watcher?.close()
    this.saveState()
  }

  // ── 탐색기: 이름 변경 ──

  async renameProject(projectKey, newName) {
    const projectId = this.projectCache.get(projectKey)
    if (!projectId) {
      // cache에 없으면 syncedFiles에서 찾기
      for (const [relPath, entry] of Object.entries(this.state.syncedFiles)) {
        if (relPath.startsWith(projectKey + '/')) {
          this.projectCache.set(projectKey, entry.projectId)
          break
        }
      }
    }
    const pid = this.projectCache.get(projectKey)
    if (!pid) throw new Error('프로젝트를 찾을 수 없습니다')

    const oldPath = path.join(this.watchDir, ...projectKey.split('/'))
    const parts = projectKey.split('/')
    parts[parts.length - 1] = newName
    const newKey = parts.join('/')
    const newPath = path.join(this.watchDir, ...parts)

    if (fs.existsSync(newPath)) throw new Error('같은 이름의 폴더가 이미 있습니다')

    // 1. state를 먼저 업데이트 (chokidar 이벤트가 와도 무시되게)
    const updates = {}
    for (const [relPath, entry] of Object.entries(this.state.syncedFiles)) {
      if (relPath.startsWith(projectKey + '/')) {
        const newRelPath = newKey + relPath.slice(projectKey.length)
        delete this.state.syncedFiles[relPath]
        updates[newRelPath] = { ...entry }
      }
    }
    Object.assign(this.state.syncedFiles, updates)

    this.projectCache.delete(projectKey)
    this.projectCache.set(newKey, pid)
    this.approvedFolders.delete(projectKey)
    this.approvedFolders.add(newKey)
    this.saveState()

    // 2. 로컬 폴더 이름 변경
    fs.renameSync(oldPath, newPath)

    // 3. Firestore 프로젝트 이름 업데이트
    await this.api.updateProject(pid, { name: newName })

    return { ok: true, newKey }
  }

  async renameFile(relPath, newFileName) {
    const entry = this.state.syncedFiles[relPath]
    if (!entry) throw new Error('파일을 찾을 수 없습니다')

    const oldPath = path.join(this.watchDir, ...relPath.split('/'))
    const dir = path.dirname(oldPath)
    const newPath = path.join(dir, newFileName)

    if (fs.existsSync(newPath)) throw new Error('같은 이름의 파일이 이미 있습니다')

    // 1. state 먼저 업데이트
    const parts = relPath.split('/')
    parts[parts.length - 1] = newFileName
    const newRelPath = parts.join('/')

    delete this.state.syncedFiles[relPath]
    this.state.syncedFiles[newRelPath] = { ...entry }
    this.saveState()

    // 2. 로컬 파일 이름 변경
    fs.renameSync(oldPath, newPath)

    // 3. Firestore 에셋 이름 업데이트
    await this.api.updateAsset(entry.assetId, { fileName: newFileName })

    return { ok: true, newRelPath }
  }

  // ── 탐색기: 파일 목록 + 순서 변경 ──

  async getProjectFiles(projectKey) {
    const files = []
    for (const [relPath, entry] of Object.entries(this.state.syncedFiles)) {
      if (relPath.startsWith(projectKey + '/')) {
        files.push({
          relPath,
          fileName: relPath.split('/').pop(),
          assetId: entry.assetId,
          projectId: entry.projectId,
          isVideo: isVideo(relPath),
          url: null,
          order: 999,
          isThumbnail: false,
        })
      }
    }
    if (files.length === 0) return files

    // Firestore에서 order, url, 썸네일 정보 가져오기
    try {
      const { assets } = await this.api.getAssetsByProject(files[0].projectId)
      const assetMap = new Map()
      for (const a of assets) assetMap.set(a.id, a)

      const project = await this.api.getProject(files[0].projectId)
      const thumbnailUrl = project?.thumbnailUrl || null

      for (const f of files) {
        const a = assetMap.get(f.assetId)
        if (a) {
          f.order = a.order ?? 999
          f.url = a.url || null
          f.videoThumbnailUrl = a.videoThumbnailUrl || null
          // 이 파일이 프로젝트 썸네일인지 확인
          if (thumbnailUrl && f.url === thumbnailUrl) f.isThumbnail = true
        }
      }
      files.sort((a, b) => a.order - b.order || a.fileName.localeCompare(b.fileName))
    } catch {
      files.sort((a, b) => a.fileName.localeCompare(b.fileName))
    }

    return files
  }

  async reorderFiles(orderedAssetIds) {
    for (let i = 0; i < orderedAssetIds.length; i++) {
      await this.api.updateAsset(orderedAssetIds[i], { order: i })
    }
    return { ok: true }
  }
}

module.exports = { SyncEngine }

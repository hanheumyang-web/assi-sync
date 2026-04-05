const chokidar = require('chokidar')
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')
const { randomUUID } = require('crypto')
const admin = require('firebase-admin')

const MAX_DIM = 2048
const MAX_SIZE = 7 * 1024 * 1024
const JPEG_QUALITY = 92
const STORAGE_BUCKET = 'assi-app-6ea04.firebasestorage.app'

// Bunny Stream config
const BUNNY_API_KEY = '943d82bf-963e-4946-93506adc8c7f-adcc-4af8'
const BUNNY_LIBRARY_ID = '631122'
const BUNNY_API_BASE = `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos`
const BUNNY_CDN = 'https://vz-cd1dda72-832.b-cdn.net'

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

let adminInitialized = false

class SyncEngine {
  constructor({ uid, watchDir, statePath, serviceAccountPath, onProgress, onFileStatus, onError, onNewFolder, onFolderRemoved }) {
    this.uid = uid
    this.watchDir = watchDir
    this.statePath = statePath
    this.onProgress = onProgress || (() => {})
    this.onFileStatus = onFileStatus || (() => {})
    this.onError = onError || (() => {})
    this.onNewFolder = onNewFolder || (() => true) // returns promise<bool>
    this.onFolderRemoved = onFolderRemoved || (() => {})
    this.approvedFolders = new Set()
    this.deniedFolders = new Set()
    this.pendingFolders = new Map() // projectKey → { name, path, fileCount, files[] }
    this.watcher = null
    this.state = { syncedFiles: {} }
    this.failedFiles = new Map()
    this.projectCache = new Map()
    this._ready = false

    // Firebase Admin init
    if (!adminInitialized) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'))
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: STORAGE_BUCKET,
      })
      adminInitialized = true
    }

    this.db = admin.firestore()
    this.bucket = admin.storage().bucket()

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

  // 파일 바로 위 폴더(리프 폴더)를 프로젝트명으로 사용
  getProjectName(filePath) {
    const parts = path.relative(this.watchDir, filePath).split(path.sep)
    // 최소 2단계 (폴더/파일)
    return parts.length >= 2 ? parts[parts.length - 2] : null
  }

  // 리프 폴더의 전체 경로 키 (중복 이름 구분용)
  getProjectKey(filePath) {
    const parts = path.relative(this.watchDir, filePath).split(path.sep)
    if (parts.length < 2) return null
    // 파일 제외한 폴더 경로 전체
    return parts.slice(0, -1).join('/')
  }

  async findOrCreateProject(name, projectKey) {
    // projectKey 기반 캐시 (같은 이름이라도 경로가 다르면 별도)
    if (this.projectCache.has(projectKey)) return this.projectCache.get(projectKey)

    // 같은 이름의 프로젝트가 이미 있는지 확인
    const snap = await this.db.collection('projects')
      .where('uid', '==', this.uid)
      .where('name', '==', name)
      .limit(1).get()

    // 이미 이 경로로 캐시된 다른 프로젝트가 있는지 확인
    const existingKeys = [...this.projectCache.entries()]
      .filter(([k]) => k !== projectKey)
      .map(([k]) => k)

    if (!snap.empty) {
      const id = snap.docs[0].id
      // 같은 이름이 다른 경로에서 이미 사용 중인지 확인
      const usedByOther = existingKeys.some(k => {
        const cachedName = k.split('/').pop()
        return cachedName === name
      })

      if (!usedByOther) {
        this.projectCache.set(projectKey, id)
        return id
      }
    }

    // 중복 이름이면 넘버링
    let finalName = name
    if (snap.empty) {
      // 이름 사용 안 됨, 그대로 사용
    } else {
      // 이미 같은 이름이 다른 경로에서 사용 중 → 넘버링
      let n = 2
      while (true) {
        finalName = `${name} (${n})`
        const check = await this.db.collection('projects')
          .where('uid', '==', this.uid)
          .where('name', '==', finalName)
          .limit(1).get()
        if (check.empty) break
        // 이미 존재하지만 이 경로용인지 확인
        const existingId = check.docs[0].id
        const isOurs = [...this.projectCache.entries()].some(([k, v]) => v === existingId && k === projectKey)
        if (isOurs) {
          this.projectCache.set(projectKey, existingId)
          return existingId
        }
        n++
      }
    }

    const docRef = await this.db.collection('projects').add({
      uid: this.uid,
      name: finalName,
      client: '',
      category: 'FASHION',
      shootDate: null,
      embargoDate: null,
      embargoStatus: 'none',
      imageCount: 0,
      videoCount: 0,
      thumbnailUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    this.projectCache.set(projectKey, docRef.id)
    return docRef.id
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
    const file = this.bucket.file(storagePath)
    const token = randomUUID()

    await file.save(buffer, {
      metadata: {
        contentType,
        contentDisposition: 'inline',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    })

    const encodedPath = encodeURIComponent(storagePath)
    return `https://firebasestorage.googleapis.com/v0/b/${this.bucket.name}/o/${encodedPath}?alt=media&token=${token}`
  }

  async uploadToBunny(buffer, fileName, projectId, assetId, relPath) {
    try {
      // 1. Create Bunny video entry
      const createRes = await fetch(BUNNY_API_BASE, {
        method: 'POST',
        headers: { 'AccessKey': BUNNY_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `${projectId}_${fileName}` }),
      })
      const meta = await createRes.json()
      const bunnyVideoId = meta.guid
      if (!bunnyVideoId) throw new Error('Bunny create failed: ' + JSON.stringify(meta))

      this.onFileStatus({ path: relPath, status: 'uploading', progress: 50, fileName, isVideo: true, size: fmt(buffer.length), phase: 'Bunny 업로드 중...' })

      // 2. Upload to Bunny
      const uploadRes = await fetch(`${BUNNY_API_BASE}/${bunnyVideoId}`, {
        method: 'PUT',
        headers: { 'AccessKey': BUNNY_API_KEY, 'Content-Type': 'application/octet-stream' },
        body: buffer,
      })
      if (!uploadRes.ok) throw new Error(`Bunny upload failed (${uploadRes.status})`)

      // 3. Update asset with Bunny info
      const embedUrl = `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${bunnyVideoId}`
      await this.db.collection('assets').doc(assetId).update({
        videoHost: 'bunny',
        bunnyVideoId,
        embedUrl,
        bunnyStatus: 'processing',
        bunnyUploadedAt: new Date().toISOString(),
      })

      // 인코딩 완료 폴링 (백그라운드)
      this.pollBunnyEncoding(bunnyVideoId, assetId, projectId, fileName)

      return { bunnyVideoId, embedUrl }
    } catch (err) {
      console.error('[Bunny] Upload failed for', fileName, err.message)
      // Non-fatal: video still accessible via Storage URL
      return null
    }
  }

  async pollBunnyEncoding(bunnyVideoId, assetId, projectId, fileName) {
    const maxAttempts = 60 // 최대 30분 (30초 간격)
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 30000)) // 30초 대기

      try {
        const res = await fetch(`${BUNNY_API_BASE}/${bunnyVideoId}`, {
          headers: { 'AccessKey': BUNNY_API_KEY },
        })
        const info = await res.json()

        if (info.status === 4) {
          // 인코딩 완료 → 썸네일 다운로드
          const thumbFile = info.thumbnailFileName || 'thumbnail.jpg'
          const thumbRes = await fetch(`${BUNNY_CDN}/${bunnyVideoId}/${thumbFile}`, {
            headers: { 'Referer': 'https://assi-portfolio.vercel.app' },
          })

          if (thumbRes.ok) {
            const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer())
            const storagePath = `thumbnails/${this.uid}/${projectId}/${bunnyVideoId}.jpg`
            const file = this.bucket.file(storagePath)
            await file.save(thumbBuffer, {
              metadata: { contentType: 'image/jpeg', contentDisposition: 'inline' },
            })
            await file.makePublic()
            const videoThumbnailUrl = `https://storage.googleapis.com/${this.bucket.name}/${storagePath}`

            await this.db.collection('assets').doc(assetId).update({
              bunnyStatus: 'ready',
              videoThumbnailUrl,
              bunnyEncodedAt: new Date().toISOString(),
            })

            // 프로젝트 썸네일 업데이트
            const projRef = this.db.collection('projects').doc(projectId)
            const projDoc = await projRef.get()
            if (projDoc.exists && !projDoc.data().thumbnailUrl) {
              await projRef.update({ thumbnailUrl: videoThumbnailUrl })
            }

            console.log(`[Bunny] ${fileName} 인코딩 완료, 썸네일 저장됨`)
          } else {
            await this.db.collection('assets').doc(assetId).update({ bunnyStatus: 'ready' })
          }
          return
        } else if (info.status === 5) {
          // 인코딩 실패
          await this.db.collection('assets').doc(assetId).update({
            bunnyStatus: 'error',
            bunnyError: 'Encoding failed',
          })
          console.log(`[Bunny] ${fileName} 인코딩 실패`)
          return
        }
        // status 0-3: 아직 처리 중, 계속 폴링
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

    // 새 폴더 감지 시 확인 (실시간 감시 중일 때만)
    const projectKey = this.getProjectKey(filePath)
    if (this._ready && projectKey && !this.approvedFolders.has(projectKey)) {
      if (this.deniedFolders.has(projectKey)) {
        // 대기 목록의 파일 수 업데이트
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

      // 이미 동기화된 폴더인지 확인
      const alreadySynced = Object.keys(this.state.syncedFiles).some(k => k.startsWith(projectKey + '/'))
      if (!alreadySynced) {
        // 폴더 내 파일 수 세기
        const folderPath = path.join(this.watchDir, ...projectKey.split('/'))
        let fileCount = 0
        try {
          const entries = fs.readdirSync(folderPath)
          fileCount = entries.filter(e => isSupported(e)).length
        } catch {}

        const approved = await this.onNewFolder({ name: projectName, path: projectKey, fileCount })
        if (!approved) {
          this.deniedFolders.add(projectKey)
          // 대기 목록에 추가
          this.pendingFolders.set(projectKey, {
            name: projectName,
            path: projectKey,
            fileCount,
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
      const projectId = await this.findOrCreateProject(projectName, projectKey)
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

      const sizeStr = `${fmt(originalSize)}${isImg && originalSize !== compressedSize ? '→' + fmt(compressedSize) : ''}`
      this.onFileStatus({ path: relPath, status: 'uploading', progress: 10, fileName, isVideo: isVid, size: sizeStr })

      const storagePath = `users/${this.uid}/projects/${projectId}/${Date.now()}_${fileName}`

      // 영상: Firestore 문서 먼저
      let assetId
      if (isVid) {
        const assetDoc = await this.db.collection('assets').add({
          uid: this.uid, projectId, fileName, fileSize: compressedSize,
          fileType: contentType, isVideo: true, url: '', storagePath,
          createdAt: new Date().toISOString(),
        })
        assetId = assetDoc.id
        this.onFileStatus({ path: relPath, status: 'uploading', progress: 20, fileName, isVideo: isVid, size: sizeStr })
      }

      // Storage 업로드
      const url = await this.uploadToStorage(buffer, storagePath, contentType)
      this.onFileStatus({ path: relPath, status: 'uploading', progress: 40, fileName, isVideo: isVid, size: sizeStr })

      if (isVid) {
        await this.db.collection('assets').doc(assetId).update({ url })

        // Bunny Stream 직접 업로드 (Cloud Function 의존 제거)
        await this.uploadToBunny(buffer, fileName, projectId, assetId, relPath)
        this.onFileStatus({ path: relPath, status: 'uploading', progress: 90, fileName, isVideo: isVid, size: sizeStr })
      } else {
        const assetDoc = await this.db.collection('assets').add({
          uid: this.uid, projectId, fileName, fileSize: compressedSize,
          fileType: contentType, isVideo: false, url, storagePath,
          createdAt: new Date().toISOString(),
        })
        assetId = assetDoc.id
      }

      // 프로젝트 카운터 업데이트
      const projectRef = this.db.collection('projects').doc(projectId)
      const updates = {
        [isVid ? 'videoCount' : 'imageCount']: admin.firestore.FieldValue.increment(1),
        updatedAt: new Date().toISOString(),
      }
      const projectDoc = await projectRef.get()
      if (projectDoc.exists && !projectDoc.data().thumbnailUrl && !isVid) {
        updates.thumbnailUrl = url
      }
      await projectRef.update(updates)

      // state 기록
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
      // 최신 파일 수 반영
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

    // 해당 폴더의 모든 파일 동기화
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
      this.onError({ message: `폴더 업로드 실패: ${projectKey}`, error: err.message })
    }
  }

  removePendingFolder(projectKey) {
    this.deniedFolders.delete(projectKey)
    this.pendingFolders.delete(projectKey)
  }

  getSyncedFolders() {
    // syncedFiles에서 projectKey별로 그룹핑
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

    // 로컬 폴더 존재 여부 확인 → 없으면 목록에서 제외
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
    // 해당 폴더의 syncedFiles 기록 삭제 후 다시 동기화
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
      this.onError({ message: `재업로드 실패: ${projectKey}`, error: err.message })
    }
  }

  async deleteSyncedFolder(projectKey) {
    // Firestore에서 프로젝트+에셋 삭제, syncedFiles 기록 삭제
    const entries = Object.entries(this.state.syncedFiles)
      .filter(([relPath]) => relPath.startsWith(projectKey + '/'))

    let projectId = null
    for (const [relPath, entry] of entries) {
      projectId = entry.projectId
      try { await this.bucket.file(entry.storagePath).delete() } catch {}
      try { await this.db.collection('assets').doc(entry.assetId).delete() } catch {}
      delete this.state.syncedFiles[relPath]
    }

    if (projectId) {
      try { await this.db.collection('projects').doc(projectId).delete() } catch {}
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
    // 서버에서 이 유저의 프로젝트 목록 가져오기
    this.onProgress({ phase: 'scanning', total: 0, completed: 0 })
    const projectSnap = await this.db.collection('projects')
      .where('uid', '==', this.uid).get()

    // 프로젝트명 → projectId 캐시 구축
    const serverProjects = new Map() // name → { id, assetFileNames }
    for (const doc of projectSnap.docs) {
      const data = doc.data()
      serverProjects.set(data.name, { id: doc.id, name: data.name })
      // projectCache에도 등록 (중복 생성 방지)
    }

    // 로컬 폴더 스캔해서 서버 프로젝트와 매칭
    const localFolders = new Map() // projectKey → { name, files[] }
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

    // 매칭된 프로젝트의 에셋을 서버에서 가져와서 syncState 복구
    for (const [key, folder] of localFolders) {
      const sp = serverProjects.get(folder.name)
      if (!sp) continue // 서버에 없는 폴더 → 새 폴더

      this.projectCache.set(key, sp.id)
      this.approvedFolders.add(key)

      // 이 프로젝트의 에셋 파일명 가져오기
      const assetSnap = await this.db.collection('assets')
        .where('projectId', '==', sp.id).get()
      const serverFiles = new Set()
      const assetMap = new Map() // fileName → { assetId, storagePath }
      for (const doc of assetSnap.docs) {
        const d = doc.data()
        serverFiles.add(d.fileName)
        assetMap.set(d.fileName, { assetId: doc.id, storagePath: d.storagePath || '' })
      }

      // 로컬 파일과 비교, 서버에 있으면 syncState 복구
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
    // 서버와 동기화 상태 비교
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

      this.watcher.on('unlinkDir', (p) => {
        // 로컬 폴더 삭제 감지 → UI 갱신
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
      try { await this.bucket.file(entry.storagePath).delete() } catch {}
      await this.db.collection('assets').doc(entry.assetId).delete()

      const isVid = /\.(mp4|mov|avi|mkv|webm|m4v|wmv|flv)$/i.test(entry.storagePath)
      await this.db.collection('projects').doc(entry.projectId).update({
        [isVid ? 'videoCount' : 'imageCount']: admin.firestore.FieldValue.increment(-1),
        updatedAt: new Date().toISOString(),
      })

      delete this.state.syncedFiles[relPath]
      this.saveState()
      this.onFileStatus({ path: relPath, status: 'deleted', fileName: path.basename(filePath) })
    } catch (err) {
      this.onError({ message: `삭제 실패: ${relPath}`, error: err.message })
    }
  }

  stop() {
    this.watcher?.close()
    this.saveState()
  }
}

module.exports = { SyncEngine }

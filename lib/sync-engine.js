// ASSI Sync Engine v2 — Secure edition
// No more Firebase Admin SDK or hardcoded API keys
// All operations go through the Vercel API backend

const chokidar = require('chokidar')
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
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
  // audio
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac',
  aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/opus', wma: 'audio/x-ms-wma',
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'avif', 'cr2', 'nef', 'arw', 'dng', 'raf'])
const VIDEO_EXTS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'wmv', 'flv'])
const AUDIO_EXTS = new Set(['mp3', 'wav', 'm4a', 'flac', 'aac', 'ogg', 'opus', 'wma'])
// [V2 Design] 디자인 소스 파일 지원 중단 (2026-04-20)
// - .fig 은 Figma 독점 포맷 + 내부 썸네일이 전체 캔버스 오버뷰 와이드 띠로 저화질
// - ASSI 의 "폴더에 넣으면 바로 깔끔하게 보임" 약속을 지킬 수 없음
// - 대안: Figma 에서 "Export frames as PDF" → PDF 파이프라인이 프레임별 고화질 JPEG 로 자동 변환
const DESIGN_EXTS = new Set()
const PDF_EXTS = new Set(['pdf'])
const IGNORED = new Set(['thumbs.db', 'desktop.ini', '.ds_store'])

const { extractFigThumbnail } = require('./fig-thumbnail')
const { extractPdfToTmp, cleanupTmpDir } = require('./pdf-extractor')

// Phase 0 방어선 모듈 — 양방향 동기 도입 전 사전 통합 (업로드 루프 방지)
const { RecentlyDownloaded } = require('./infinite-loop-guard')
const { isMarkedSynced } = require('./xattr-marker')
const { UploadThrottle } = require('./upload-throttle')
const { DeviceRegistry } = require('./device-registry')

// 기본 카테고리는 더 이상 하드코딩하지 않음 — 프로젝트 폴더에서 자동 인식
const DEFAULT_CATEGORIES = []
function normalizeCategory(name) {
  if (!name) return null
  return name.trim().toUpperCase()
}

function getExt(name) { return name?.split('.').pop()?.toLowerCase() }
function guessContentType(name) { return CONTENT_TYPE_MAP[getExt(name)] || 'application/octet-stream' }
function isImage(name) { return IMAGE_EXTS.has(getExt(name)) }
function isVideo(name) { return VIDEO_EXTS.has(getExt(name)) }
function isAudio(name) { return AUDIO_EXTS.has(getExt(name)) }
function isDesign(name) { return DESIGN_EXTS.has(getExt(name)) }
function isFigma(name) { const e = getExt(name); return e === 'fig' || e === 'make' }
function isPdf(name) { return PDF_EXTS.has(getExt(name)) }
function isSupported(name) { return isImage(name) || isVideo(name) || isAudio(name) || isDesign(name) || isPdf(name) }
function isIgnored(name) { const b = name.split(/[/\\]/).pop().toLowerCase(); return b.startsWith('.') || IGNORED.has(b) }
function fmt(bytes) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

class SyncEngine {
  constructor({ uid, watchDir, statePath, api, onProgress, onFileStatus, onError, onNewFolder, onFolderRemoved, deviceDeps }) {
    this.uid = uid
    this.watchDir = watchDir
    this.statePath = statePath
    this.api = api // ApiClient instance
    this.onProgress = onProgress || (() => {})
    this.onFileStatus = onFileStatus || (() => {})
    this.onError = onError || (() => {})
    this.onNewFolder = onNewFolder || (() => true)
    this.onFolderRemoved = onFolderRemoved || (() => {})
    // 선택적 — main.js 에서 { safeStorage, userDataDir, appVersion, deviceName } 전달 시 자동 등록
    this._deviceDeps = deviceDeps || null
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

    // ── Phase 0 방어선 (업로드 루프·폭주 차단) ──
    // 현재 단방향 업로드라 recentlyDownloaded 는 placeholder (다운로드 구현 시 mark() 호출됨).
    // xattr/throttle 은 즉시 효과 — 같은 파일 반복 업로드 또는 이미 sync 마킹된 파일 재처리 차단.
    this.recentlyDownloaded = new RecentlyDownloaded()
    this.uploadThrottle = new UploadThrottle({ maxPerMinute: 5 })

    // ── Phase 1 디바이스 등록 (선택적 — deviceDeps 있을 때만) ──
    if (this._deviceDeps) {
      this.deviceRegistry = new DeviceRegistry({
        safeStorage: this._deviceDeps.safeStorage,
        userDataDir: this._deviceDeps.userDataDir,
        api: this.api,
        uid: this.uid,
      })
    } else {
      this.deviceRegistry = null
    }

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
  //     FIGMA/file.fig                → 카테고리=null, 프로젝트=FIGMA  (2-part: 카테고리 폴더 자체가 프로젝트)
  //     file.jpg                      → 무시 (watchDir 직속 파일)
  getProjectName(filePath) {
    const parts = path.relative(this.watchDir, filePath).split(path.sep)
    // watchDir 직속 파일은 프로젝트 판정 불가 → 무시
    if (parts.length < 2) return null
    // 2-part (FOLDER/file): 폴더 자체가 프로젝트
    if (parts.length === 2) return parts[0]
    // 3+ part: 파일의 직속 부모 폴더명
    return parts[parts.length - 2]
  }

  getCategoryName(filePath) {
    const parts = path.relative(this.watchDir, filePath).split(path.sep)
    if (parts.length < 2) return null
    // 2-part (FOLDER/file) 은 그 폴더가 곧 카테고리이자 프로젝트
    // — 사용자가 만든 폴더명을 그대로 존중 (FIGMA, DESIGN, 무엇이든)
    // 백엔드 기본값 'FASHION' 에 빠지지 않게 반드시 folder 이름 넘김.
    if (parts.length === 2) {
      const raw = parts[0]
      return normalizeCategory(raw) || raw
    }
    const raw = parts[0]
    const normalized = normalizeCategory(raw)
    return DEFAULT_CATEGORIES.includes(normalized) ? normalized : raw
  }

  getProjectKey(filePath) {
    const parts = path.relative(this.watchDir, filePath).split(path.sep)
    if (parts.length < 2) return null
    // 파일명 제외한 전체 경로 = 프로젝트 고유 키
    // 예: BEAUTY/Nike/Campaign1 (3+part) 또는 FIGMA (2-part)
    return parts.slice(0, -1).join('/')
  }

  async findOrCreateProject(name, projectKey, category) {
    if (this.projectCache.has(projectKey)) return this.projectCache.get(projectKey)

    const result = await this.api.findOrCreateProject(name, category)
    if (!result?.projectId) {
      throw new Error(`[findOrCreateProject] API returned no projectId for "${name}"`)
    }

    // ★ v1.7.9 방어선: 서버가 projectId 반환했더라도 실제 문서가 유효한지 검증
    // (유령 projectId 방지 — 이전에 write 실패/race condition으로 인한 찌꺼기 방지)
    try {
      const proj = await this.api.getProject(result.projectId)
      if (!proj || !proj.uid) {
        throw new Error(`Project ${result.projectId} has no uid field — invalid document`)
      }
      if (proj.uid !== this.uid) {
        throw new Error(`Project ${result.projectId} uid mismatch: doc=${proj.uid}, user=${this.uid}`)
      }
    } catch (e) {
      console.error(`[SyncEngine] Project validation failed for "${name}" (${result.projectId}):`, e.message)
      throw new Error(`프로젝트 검증 실패: ${e.message}`)
    }

    this.projectCache.set(projectKey, result.projectId)
    return result.projectId
  }

  // ── Content-hash dedup ──
  // 파일 내용물의 sha256 (hex). 스트림 방식이라 메모리 부담 없음.
  // 영상 1GB ≈ 2초, 이미지 무시 가능.
  computeFileHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(filePath)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
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
   * 오디오 파일 메타데이터 파싱 + embedded cover art 추출
   * @returns {{ metadata: { title, artist, album, duration }, coverBuffer: Buffer|null, coverType: string }}
   */
  async processAudio(filePath) {
    // 1) ffprobe — 태그 + duration 파싱
    let metadata = { title: '', artist: '', album: '', duration: 0 }
    try {
      const probeArgs = [
        '-v', 'error',
        '-show_entries', 'format_tags=title,artist,album,composer:format=duration',
        '-of', 'json',
        filePath,
      ]
      const stdout = await new Promise((resolve, reject) => {
        execFile(ffprobePath, probeArgs, { maxBuffer: 2 * 1024 * 1024 }, (err, so) => {
          if (err) return reject(err)
          resolve(so)
        })
      })
      const parsed = JSON.parse(stdout)
      const tags = parsed.format?.tags || {}
      // 케이스 인센시티브 (ID3v1/MP4/iTunes 다양성)
      const get = (...keys) => {
        for (const k of keys) {
          for (const [tk, tv] of Object.entries(tags)) {
            if (tk.toLowerCase() === k.toLowerCase() && tv) return tv
          }
        }
        return ''
      }
      metadata = {
        title: get('title'),
        artist: get('artist') || get('composer'),
        album: get('album'),
        duration: Math.round(parseFloat(parsed.format?.duration || 0)),
      }
    } catch (e) {
      console.warn('[Audio] ffprobe meta parse failed:', e.message)
    }

    // 2) ffmpeg — embedded cover art 추출 (attached_pic 스트림 or 비디오 첫 프레임)
    let coverBuffer = null
    let coverType = 'image/jpeg'
    const tempCover = path.join(os.tmpdir(), `assi-cover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`)
    const tryExtract = (args) => new Promise((resolve, reject) => {
      execFile(ffmpegPath, args, { maxBuffer: 10 * 1024 * 1024 }, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })
    try {
      // 1차 시도: attached_pic 스트림 그대로 추출
      await tryExtract(['-i', filePath, '-an', '-vcodec', 'copy', '-map', '0:v?', '-y', tempCover])
    } catch {
      try {
        // 2차 시도: 비디오 스트림 첫 프레임
        await tryExtract(['-i', filePath, '-vframes', '1', '-f', 'image2', '-y', tempCover])
      } catch (e) {
        console.warn('[Audio] cover extraction failed:', e.message)
      }
    }
    try {
      if (fs.existsSync(tempCover)) {
        const stat = fs.statSync(tempCover)
        if (stat.size > 0) coverBuffer = fs.readFileSync(tempCover)
        try { fs.unlinkSync(tempCover) } catch {}
      }
    } catch {}

    return { metadata, coverBuffer, coverType }
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

  // PDF → 페이지별 JPEG 시퀀스로 분해해서 일반 이미지 asset 으로 업로드.
  // 원본 PDF 자체는 sourceFile 로 저장 (다운로드 섹션에만 노출).
  // state.syncedFiles[pdfRelPath] = { pdfAssetId, projectId, pages: [{assetId, fileName}], contentHash }
  async syncPdfFile(pdfPath, projectId, relPath) {
    const fileName = path.basename(pdfPath)
    let tmpDir = null
    try {
      const stat = fs.statSync(pdfPath)
      const fileSize = stat.size
      const sizeStr = fmt(fileSize)

      this.onFileStatus({ path: relPath, status: 'uploading', progress: 5, fileName, size: sizeStr, phase: 'PDF 페이지 추출 중...' })

      const result = await extractPdfToTmp(pdfPath, {
        onProgress: ({ done, total }) => {
          const pct = Math.min(30, 5 + Math.round((done / total) * 25))
          this.onFileStatus({ path: relPath, status: 'uploading', progress: pct, fileName, size: sizeStr, phase: `PDF 페이지 추출 중 (${done}/${total})` })
        },
      })
      tmpDir = result.tmpDir
      const pages = result.pages
      const totalPages = pages.length

      const uploadedPages = []
      let newlyAddedImageCount = 0
      let firstPageUrl = null

      // 각 페이지를 일반 이미지 asset 으로 업로드 (page-level content hash dedup)
      for (let i = 0; i < pages.length; i++) {
        const pg = pages[i]
        const pageBuffer = fs.readFileSync(pg.tmpPath)
        const pageHash = crypto.createHash('sha256').update(pageBuffer).digest('hex')
        const pageRelPath = `${relPath}#${pg.pageFileName}`
        const progressBase = 30 + Math.round((i / totalPages) * 65)
        this.onFileStatus({ path: relPath, status: 'uploading', progress: progressBase, fileName, size: sizeStr, phase: `페이지 ${i + 1}/${totalPages} 업로드 중...` })

        // page-level dedup: 동일한 페이지 이미지가 이미 있으면 재사용
        let pageAssetId = null
        let pageUrl = null
        let pageStoragePath = null
        let reused = false
        try {
          const dedup = await this.api.findAssetByContentHash(pageHash).catch(() => null)
          const matched = dedup?.asset
          if (matched && matched.id) {
            const isMoveNeeded = matched.projectId !== projectId
            if (isMoveNeeded) {
              await this.api.moveAsset(matched.id, projectId, pg.pageFileName)
            }
            pageAssetId = matched.id
            pageUrl = matched.url
            pageStoragePath = matched.storagePath || ''
            reused = true
          }
        } catch {}

        if (!pageAssetId) {
          pageStoragePath = `users/${this.uid}/projects/${projectId}/${Date.now()}_${pg.pageFileName}`
          pageUrl = await this.uploadToStorage(pageBuffer, pageStoragePath, 'image/jpeg')
          const { assetId: aid } = await this.api.createAsset({
            uid: this.uid, projectId,
            fileName: pg.pageFileName,
            fileSize: pg.byteSize,
            fileType: 'image/jpeg',
            isVideo: false,
            url: pageUrl,
            storagePath: pageStoragePath,
            parentPdfFileName: fileName,
            derivedFromPdf: true,
            pdfPageIndex: pg.pageIndex,
            pdfPageTotal: pg.total,
            contentHash: pageHash,
            createdAt: new Date().toISOString(),
          })
          pageAssetId = aid
          newlyAddedImageCount++
        }

        if (i === 0) firstPageUrl = pageUrl
        uploadedPages.push({ assetId: pageAssetId, fileName: pg.pageFileName, reused })
      }

      // PDF 원본은 sourceFile 로 업로드 (다운로드용)
      this.onFileStatus({ path: relPath, status: 'uploading', progress: 95, fileName, size: sizeStr, phase: 'PDF 원본 저장 중...' })
      const pdfHash = await this.computeFileHash(pdfPath).catch(() => null)
      const pdfStoragePath = `users/${this.uid}/projects/${projectId}/${Date.now()}_${fileName}`
      const pdfUrl = await this.api.uploadFileStream(pdfPath, pdfStoragePath, 'application/pdf', fileSize)
      const { assetId: pdfAssetId } = await this.api.createAsset({
        uid: this.uid, projectId, fileName,
        fileSize,
        fileType: 'application/pdf',
        sourceFile: true,
        sourceType: 'pdf',
        pdfPageTotal: totalPages,
        url: pdfUrl,
        storagePath: pdfStoragePath,
        contentHash: pdfHash || null,
        createdAt: new Date().toISOString(),
      })

      // 프로젝트 카운터 + 썸네일 업데이트
      const project = await this.api.getProject(projectId).catch(() => null)
      const updates = {}
      if (newlyAddedImageCount > 0) {
        updates._increments = { imageCount: newlyAddedImageCount }
      }
      if (project && !project.thumbnailUrl && firstPageUrl) {
        updates.thumbnailUrl = firstPageUrl
      }
      if (Object.keys(updates).length > 0) {
        await this.api.updateProject(projectId, updates)
      }

      this.state.syncedFiles[relPath] = {
        assetId: pdfAssetId,
        projectId,
        storagePath: pdfStoragePath,
        syncedAt: new Date().toISOString(),
        fileSize,
        contentHash: pdfHash || null,
        pdfPages: uploadedPages,
      }
      this.saveState()
      this.failedFiles.delete(relPath)

      this.onFileStatus({ path: relPath, status: 'done', progress: 100, fileName, size: sizeStr, phase: `PDF ${totalPages}페이지 완료` })
    } catch (err) {
      console.error('[PDF] Upload failed for', fileName, err.message)
      this.onFileStatus({ path: relPath, status: 'failed', progress: 0, fileName, error: err.message || 'PDF 처리 실패' })
      this.failedFiles.set(relPath, { error: err.message, retries: (this.failedFiles.get(relPath)?.retries || 0) + 1 })
    } finally {
      cleanupTmpDir(tmpDir)
    }
  }

  async syncFile(filePath, _fromBatch = false) {
    const projectName = this.getProjectName(filePath)
    if (!projectName) return

    const relPath = this.getRelPath(filePath)
    if (this.state.syncedFiles[relPath]) return

    // ── Phase 0 Layer 2 — xattr 마킹 체크 ──
    // 동기화 다운로드로 받은 파일이면 여기서 바로 return (업로드 루프 차단)
    // 실패 시 false 반환이라 정상 진행. 현재는 download 미구현이라 대부분 false.
    if (await isMarkedSynced(filePath)) {
      return
    }

    const fileName = path.basename(filePath)
    const contentType = guessContentType(fileName)
    const isVid = isVideo(fileName)
    const isImg = isImage(fileName)
    const isAud = isAudio(fileName)
    const isFig = isFigma(fileName)
    const isPdfFile = isPdf(fileName)
    if (!isImg && !isVid && !isAud && !isFig && !isPdfFile) return

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

      // ── PDF: 페이지별 JPEG 시퀀스로 쪼개서 일반 이미지처럼 업로드 ──
      // 각 페이지가 독립 asset 이라 기존 포트폴리오 뷰어(세로 스크롤) 가 그대로 동작.
      // PDF 원본은 sourceFile 로 별도 저장 → 포트폴리오 다운로드 섹션에서 노출.
      if (isPdfFile) {
        await this.syncPdfFile(filePath, projectId, relPath)
        return
      }

      // ── Content-hash dedup ──
      // 이미 같은 내용물의 자산이 서버에 있으면 Storage/Bunny 재업로드 안 하고 metadata만 갱신.
      // 영상 1GB ≈ 2초 해시 비용 — 5~30분 Bunny 재인코딩 회피하면 무조건 이득.
      let contentHash = null
      let fileSizeForState = 0
      try {
        const stat = fs.statSync(filePath)
        fileSizeForState = stat.size
        this.onFileStatus({ path: relPath, status: 'uploading', progress: 5, fileName, isVideo: isVid, phase: '파일 확인 중...' })
        contentHash = await this.computeFileHash(filePath)

        // ── Phase 0 Layer 1 — recentlyDownloaded Map 체크 ──
        // 다운로드 직후(60초 내) 같은 hash 재등장하면 루프로 간주하고 무시
        if (this.recentlyDownloaded.has(contentHash)) {
          this.onFileStatus({ path: relPath, status: 'done', progress: 100, fileName, isVideo: isVid, reused: true, phase: '동기화 에코 — 스킵' })
          return
        }

        // ── Phase 0 Throttle — 60초 내 5회 초과 시 자동 정지 ──
        if (!this.uploadThrottle.shouldAllow(contentHash)) {
          console.warn(`[Throttle] ${fileName} 업로드 60초 5회 초과 — 자동 정지. 무한 루프 의심.`)
          this.onFileStatus({ path: relPath, status: 'failed', progress: 0, fileName, isVideo: isVid, error: '반복 업로드 자동 정지 (루프 의심)' })
          this.failedFiles.set(relPath, { error: 'upload throttled', retries: 99 })
          return
        }

        const dedup = await this.api.findAssetByContentHash(contentHash).catch(() => null)
        const matched = dedup?.asset
        if (matched && matched.id) {
          // 매치! Storage 원본 + Bunny 인코딩본 모두 그대로 재사용. projectId/fileName만 변경.
          const oldProjectId = matched.projectId
          const isMoveNeeded = oldProjectId !== projectId
          const isRenameNeeded = matched.fileName !== fileName

          if (isMoveNeeded) {
            await this.api.moveAsset(matched.id, projectId, isRenameNeeded ? fileName : undefined)
          } else if (isRenameNeeded) {
            await this.api.updateAsset(matched.id, { fileName, updatedAt: new Date().toISOString() })
          }

          // 새 프로젝트 썸네일 갱신 (비어 있으면 — 영상은 videoThumbnailUrl, 이미지는 url)
          try {
            const newProj = await this.api.getProject(projectId)
            if (newProj && !newProj.thumbnailUrl) {
              const thumbCandidate = isVid ? matched.videoThumbnailUrl : matched.url
              if (thumbCandidate) {
                await this.api.updateProject(projectId, { thumbnailUrl: thumbCandidate })
              }
            }
          } catch {}

          // state 갱신 — relPath ↔ assetId 매핑 + contentHash 캐시
          this.state.syncedFiles[relPath] = {
            assetId: matched.id,
            projectId,
            storagePath: matched.storagePath || '',
            syncedAt: new Date().toISOString(),
            fileSize: fileSizeForState,
            contentHash,
          }
          this.saveState()
          this.failedFiles.delete(relPath)

          const sizeStr = fmt(fileSizeForState)
          console.log(`[Dedup] ${fileName} reused existing asset ${matched.id} (hash match) — no re-upload`)
          this.onFileStatus({ path: relPath, status: 'done', progress: 100, fileName, isVideo: isVid, size: sizeStr, reused: true, phase: '재사용 — 재업로드 없음' })
          return
        }
      } catch (hashErr) {
        console.warn(`[Dedup] hash check failed for ${fileName}: ${hashErr.message} — fallback to normal upload`)
        // 해시 계산/조회 실패해도 기존 흐름으로 진행
      }

      // ── [V2 Design] Figma .fig 전용 처리 ──
      // 1) .fig 원본은 소스파일로 업로드 (다운로드 용도, 그리드에 안 보임)
      // 2) ZIP 파싱 성공 시 내부 썸네일 PNG 을 별도 이미지 에셋으로 업로드
      //    → 그리드에서 프로젝트 커버로 사용
      // 3) 썸네일 추출 실패해도 계속 진행 (같은 폴더의 png/jpg 가 커버 역할)
      if (isFig) {
        try {
          const stat = fs.statSync(filePath)
          const fileSize = stat.size
          const sizeStr = fmt(fileSize)

          // (1) 썸네일 추출 시도 (ZIP 파싱)
          this.onFileStatus({ path: relPath, status: 'uploading', progress: 10, fileName, size: sizeStr, phase: 'Figma 썸네일 추출 중...' })
          let thumbUrl = null
          let thumbStoragePath = null
          try {
            const thumbBuffer = await extractFigThumbnail(filePath)
            if (thumbBuffer && thumbBuffer.length > 0) {
              const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.(fig|make)$/i, '')
              thumbStoragePath = `users/${this.uid}/projects/${projectId}/${Date.now()}_${safeName}_thumb.png`
              this.onFileStatus({ path: relPath, status: 'uploading', progress: 25, fileName, size: sizeStr, phase: '썸네일 업로드 중...' })
              thumbUrl = await this.uploadToStorage(thumbBuffer, thumbStoragePath, 'image/png')
              console.log(`[Figma] Thumbnail extracted: ${fileName} (${fmt(thumbBuffer.length)})`)
            } else {
              console.log(`[Figma] No thumbnail in ${fileName} (non-ZIP format or missing entry) — skip thumb upload`)
            }
          } catch (thErr) {
            console.warn(`[Figma] Thumb extract failed for ${fileName}: ${thErr.message}`)
          }

          // (2) .fig 원본 파일 Storage 업로드
          this.onFileStatus({ path: relPath, status: 'uploading', progress: 50, fileName, size: sizeStr, phase: '.fig 업로드 중...' })
          const storagePath = `users/${this.uid}/projects/${projectId}/${Date.now()}_${fileName}`
          const url = await this.api.uploadFileStream(filePath, storagePath, 'application/octet-stream', fileSize)

          // (3) 썸네일 이미지 에셋 생성 (있을 때만 — 그리드 렌더용)
          let thumbAssetId = null
          if (thumbUrl && thumbStoragePath) {
            const thumbResult = await this.api.createAsset({
              uid: this.uid, projectId,
              fileName: fileName.replace(/\.(fig|make)$/i, '') + '.preview.png',
              fileSize: 0, // 썸네일 크기는 중요치 않음
              fileType: 'image/png',
              isVideo: false,
              url: thumbUrl,
              storagePath: thumbStoragePath,
              // 부모 .fig 와 연결
              parentFigFileName: fileName,
              derivedFromFig: true,
              createdAt: new Date().toISOString(),
            })
            thumbAssetId = thumbResult.assetId
          }

          // (4) .fig 원본 에셋 생성 (sourceFile 플래그 → 그리드에선 숨김, 다운로드 섹션에만 표시)
          this.onFileStatus({ path: relPath, status: 'uploading', progress: 80, fileName, size: sizeStr, phase: 'Firestore 기록 중...' })
          const { assetId } = await this.api.createAsset({
            uid: this.uid, projectId, fileName,
            fileSize,
            fileType: 'application/figma',
            sourceFile: true,
            sourceType: 'figma',
            url, storagePath,
            contentHash: contentHash || null,
            createdAt: new Date().toISOString(),
          })

          // (5) 프로젝트 카운터/썸네일 업데이트
          // - .fig 자체는 imageCount/videoCount 증가시키지 않음 (sourceFile 이라서)
          // - 썸네일 추출된 경우 그건 imageCount +1 (일반 이미지 취급)
          const project = await this.api.getProject(projectId).catch(() => null)
          const updates = {}
          if (thumbAssetId) {
            updates._increments = { imageCount: 1 }
            if (project && !project.thumbnailUrl) {
              updates.thumbnailUrl = thumbUrl
            }
          }
          if (Object.keys(updates).length > 0) {
            await this.api.updateProject(projectId, updates)
          }

          // (6) state 저장
          this.state.syncedFiles[relPath] = {
            assetId, projectId, storagePath,
            thumbAssetId: thumbAssetId || null,
            syncedAt: new Date().toISOString(),
            fileSize: fileSizeForState || fileSize,
            contentHash: contentHash || null,
          }
          this.saveState()
          this.failedFiles.delete(relPath)

          this.onFileStatus({ path: relPath, status: 'done', progress: 100, fileName, size: sizeStr, phase: thumbUrl ? 'Figma 파일 + 썸네일 완료' : 'Figma 파일 완료 (썸네일 없음)' })
        } catch (err) {
          console.error('[Figma] Upload failed for', fileName, err.message)
          this.onFileStatus({ path: relPath, status: 'failed', progress: 0, fileName, error: err.message || 'Figma 업로드 실패' })
          this.failedFiles.set(relPath, { error: err.message, retries: (this.failedFiles.get(relPath)?.retries || 0) + 1 })
        }
        return // ── .fig 는 여기서 종료 ──
      }

      // ── 오디오 전용 처리 (이미지/영상과 분리된 경로로 early return) ──
      if (isAud) {
        try {
          const stat = fs.statSync(filePath)
          const fileSize = stat.size
          const sizeStr = fmt(fileSize)

          this.onFileStatus({ path: relPath, status: 'uploading', progress: 10, fileName, isAudio: true, phase: '메타/자켓 추출 중...' })
          // 1) ffprobe + ffmpeg로 태그/자켓 추출
          const { metadata, coverBuffer } = await this.processAudio(filePath)

          // 2) 자켓 Storage 업로드 (있을 경우)
          let albumArtUrl = null
          if (coverBuffer) {
            const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
            const artPath = `users/${this.uid}/audio-art/${Date.now()}_${safeName}.jpg`
            try {
              this.onFileStatus({ path: relPath, status: 'uploading', progress: 30, fileName, isAudio: true, size: sizeStr, phase: '자켓 업로드 중...' })
              albumArtUrl = await this.uploadToStorage(coverBuffer, artPath, 'image/jpeg')
              console.log(`[Audio] Cover uploaded: ${fileName} (${fmt(coverBuffer.length)})`)
            } catch (e) {
              console.warn(`[Audio] Cover upload failed: ${e.message}`)
            }
          }

          // 3) 오디오 파일 Storage 업로드
          this.onFileStatus({ path: relPath, status: 'uploading', progress: 50, fileName, isAudio: true, size: sizeStr, phase: '오디오 업로드 중...' })
          const storagePath = `users/${this.uid}/projects/${projectId}/${Date.now()}_${fileName}`
          const url = await this.api.uploadFileStream(filePath, storagePath, contentType, fileSize)

          this.onFileStatus({ path: relPath, status: 'uploading', progress: 85, fileName, isAudio: true, size: sizeStr, phase: 'Firestore 기록 중...' })
          // 4) Firestore asset 문서 생성
          const { assetId } = await this.api.createAsset({
            uid: this.uid, projectId, fileName,
            fileSize,
            fileType: contentType,
            type: 'audio',
            isAudio: true,
            url, storagePath,
            audio: {
              title: metadata.title || fileName.replace(/\.[^.]+$/, ''),
              artist: metadata.artist || '',
              album: metadata.album || '',
              duration: metadata.duration || 0,
              albumArtUrl: albumArtUrl || null,
              fallbackVideoUrl: null,
            },
            contentHash: contentHash || null,
            createdAt: new Date().toISOString(),
          })

          // 5) 프로젝트 카운터 + 썸네일 + 타입 마킹
          const project = await this.api.getProject(projectId).catch(() => null)
          const updates = { _increments: { audioCount: 1 } }
          const isPureAudioProject = project && !project.type && !(project.imageCount > 0) && !(project.videoCount > 0)
          if (isPureAudioProject) {
            updates.type = 'audio'
            updates.category = project.category || 'audio'
          }
          if (project && !project.thumbnailUrl && albumArtUrl) {
            updates.thumbnailUrl = albumArtUrl
          }
          await this.api.updateProject(projectId, updates)

          // 6) state 저장
          this.state.syncedFiles[relPath] = {
            assetId, projectId, storagePath,
            syncedAt: new Date().toISOString(),
            fileSize: fileSizeForState || fileSize,
            contentHash: contentHash || null,
          }
          this.saveState()
          this.failedFiles.delete(relPath)

          this.onFileStatus({ path: relPath, status: 'done', progress: 100, fileName, isAudio: true, size: sizeStr })
        } catch (err) {
          console.error('[Audio] Upload failed for', fileName, err.message)
          this.onFileStatus({ path: relPath, status: 'failed', progress: 0, fileName, isAudio: true, error: err.message || '오디오 업로드 실패' })
          this.failedFiles.set(relPath, { error: err.message, retries: (this.failedFiles.get(relPath)?.retries || 0) + 1 })
        }
        return // ── 오디오는 여기서 종료 (이미지/영상 로직 스킵) ──
      }

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
          contentHash: contentHash || null,
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
          contentHash: contentHash || null,
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
      this.state.syncedFiles[relPath] = {
        assetId, projectId, storagePath,
        syncedAt: new Date().toISOString(),
        fileSize: fileSizeForState || originalSize,
        contentHash: contentHash || null,
      }
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
    // 먼저: 서버 카테고리가 바뀌었으면 로컬 폴더 이동 (웹 → 로컬 동기화)
    for (const [key, folder] of localFolders) {
      const sp = serverProjects.get(folder.name)
      if (!sp) continue

      const parts = key.split('/')
      // [V1.9.4] 2단계 구조 (FOLDER/file) — 폴더명 = 카테고리 = 프로젝트
      // 서버 카테고리가 폴더명과 다르면 서버를 폴더명으로 업데이트 (잘못된 FASHION 등 치환)
      if (parts.length === 1) {
        const localCat = normalizeCategory(parts[0]) || parts[0]
        const serverCat = normalizeCategory(sp.category)
        if (serverCat !== localCat) {
          try {
            await this.api.updateProject(sp.id, { category: localCat })
            console.log(`[Category sync] ${sp.name}: "${sp.category}" → "${localCat}"`)
          } catch (e) {
            console.warn(`[Category sync] ${sp.name} 실패: ${e.message}`)
          }
        }
      }
      if (parts.length >= 2) {
        const localCat = normalizeCategory(parts[0])
        const serverCat = normalizeCategory(sp.category)

        // 서버 카테고리 없음(미분류) → "미분류" 폴더로 이동
        const effectiveServerCat = serverCat || '미분류'

        if (localCat !== effectiveServerCat) {
          // 서버 카테고리가 변경됨 → 로컬 폴더 이동
          try {
            const projectFolder = parts.slice(1).join(path.sep)
            const oldPath = path.join(this.watchDir, parts[0], projectFolder)
            const newCatDir = path.join(this.watchDir, sp.category || '미분류')
            const newPath = path.join(newCatDir, projectFolder)

            // 대상 카테고리 폴더 생성
            if (!fs.existsSync(newCatDir)) fs.mkdirSync(newCatDir, { recursive: true })

            // 이미 같은 이름의 폴더가 있으면 스킵
            if (!fs.existsSync(newPath) && fs.existsSync(oldPath)) {
              // 부모 디렉토리 확인
              const newParentDir = path.dirname(newPath)
              if (!fs.existsSync(newParentDir)) fs.mkdirSync(newParentDir, { recursive: true })

              fs.renameSync(oldPath, newPath)

              // syncedFiles 경로 업데이트
              const oldPrefix = key + '/'
              const newKey = [sp.category, ...parts.slice(1)].join('/')
              const newPrefix = newKey + '/'
              const updates = {}
              for (const [relPath, entry] of Object.entries(this.state.syncedFiles)) {
                if (relPath.startsWith(oldPrefix)) {
                  const newRelPath = newPrefix + relPath.slice(oldPrefix.length)
                  updates[relPath] = newRelPath
                }
              }
              for (const [oldRel, newRel] of Object.entries(updates)) {
                this.state.syncedFiles[newRel] = this.state.syncedFiles[oldRel]
                delete this.state.syncedFiles[oldRel]
              }

              // projectCache 업데이트
              if (this.projectCache.has(key)) {
                this.projectCache.set(newKey, this.projectCache.get(key))
                this.projectCache.delete(key)
              }
              if (this.approvedFolders.has(key)) {
                this.approvedFolders.add(newKey)
                this.approvedFolders.delete(key)
              }

              // localFolders 업데이트 (이후 루프에서 올바른 키 사용)
              localFolders.set(newKey, folder)
              localFolders.delete(key)

              // 빈 카테고리 폴더 정리
              try {
                const oldCatDir = path.join(this.watchDir, parts[0])
                const remaining = fs.readdirSync(oldCatDir)
                if (remaining.length === 0) fs.rmdirSync(oldCatDir)
              } catch {}

              this.saveState()
              continue
            }
          } catch (err) {
            // 이동 실패 시 서버를 로컬 카테고리로 맞춤 (fallback)
            try { await this.api.updateProject(sp.id, { category: localCat }) } catch {}
          }
        }
      }
    }

    // 다시 스캔 (폴더 이동 후 변경된 구조 반영)
    localFolders.clear()
    scanDir(this.watchDir)

    for (const [key, folder] of localFolders) {
      const sp = serverProjects.get(folder.name)
      if (!sp) continue

      this.projectCache.set(key, sp.id)
      this.approvedFolders.add(key)

      // 로컬 → 서버 카테고리 동기화 (서버에 카테고리가 없는 경우)
      const parts = key.split('/')
      if (parts.length >= 2) {
        const rawCat = parts[0]
        const category = normalizeCategory(rawCat)
        if (!sp.category && category) {
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

    // ── 웹에서 asset이 다른 프로젝트로 이동된 경우 → 로컬 파일도 따라 이동 ──
    // 모든 서버 자산을 (assetId → {projectId, fileName, projectName, category}) 인덱스로 모음
    try {
      const assetIndex = new Map()
      for (const sp of projects) {
        try {
          const { assets } = await this.api.getAssetsByProject(sp.id)
          for (const asset of assets) {
            assetIndex.set(asset.id, {
              projectId: sp.id,
              projectName: sp.name,
              category: sp.category,
              fileName: asset.fileName,
            })
          }
        } catch {}
      }

      // state.syncedFiles 순회하며 projectId/fileName 어긋남 감지
      const moveOps = []
      for (const [relPath, entry] of Object.entries(this.state.syncedFiles)) {
        const serverAsset = assetIndex.get(entry.assetId)
        if (!serverAsset) continue // 서버에서 삭제된 asset — 건드리지 않음 (다른 로직이 처리)

        const serverProjectId = serverAsset.projectId
        const serverFileName = serverAsset.fileName
        const localFileName = relPath.split('/').pop()

        if (serverProjectId === entry.projectId && serverFileName === localFileName) continue
        // 어긋남 발견 — 웹에서 이동/이름변경됨
        moveOps.push({ relPath, entry, serverAsset })
      }

      for (const op of moveOps) {
        const { relPath, entry, serverAsset } = op
        const oldFullPath = path.join(this.watchDir, ...relPath.split('/'))
        if (!fs.existsSync(oldFullPath)) {
          // 로컬에 파일 없음 — state만 정리
          delete this.state.syncedFiles[relPath]
          continue
        }

        // 새 위치 결정: {watchDir}/{category}/{projectName}/{fileName}
        const newCategory = serverAsset.category || '미분류'
        const newProjectName = serverAsset.projectName
        const newFileName = serverAsset.fileName
        const newFullPath = path.join(this.watchDir, newCategory, newProjectName, newFileName)
        const newRelPath = path.relative(this.watchDir, newFullPath).split(path.sep).join('/')

        if (oldFullPath === newFullPath) continue

        try {
          // 대상 폴더 준비
          const newDir = path.dirname(newFullPath)
          if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true })

          // 충돌 방지: 같은 위치에 이미 파일 있으면 skip (state만 업데이트)
          if (fs.existsSync(newFullPath)) {
            console.log(`[RemoteMove] 대상 위치에 파일 존재, state만 갱신: ${newRelPath}`)
          } else {
            // chokidar가 unlink+add 던질 텐데 state를 미리 새 경로로 박아두면 syncFile/tryMatchRename 모두 무시함
            this.state.syncedFiles[newRelPath] = {
              ...entry,
              projectId: serverAsset.projectId,
              syncedAt: new Date().toISOString(),
            }
            delete this.state.syncedFiles[relPath]

            // 새 폴더는 자동 승인 (웹에서의 명시적 이동이므로)
            const newProjectKey = [newCategory, newProjectName].join('/')
            this.approvedFolders.add(newProjectKey)
            this.projectCache.set(newProjectKey, serverAsset.projectId)

            fs.renameSync(oldFullPath, newFullPath)
            console.log(`[RemoteMove] 로컬 파일 이동: ${relPath} → ${newRelPath}`)
            this.onFileStatus({ path: newRelPath, status: 'renamed', fileName: newFileName, oldFileName: relPath.split('/').pop() })
          }

          // 옛 폴더가 비었으면 정리
          try {
            const oldDir = path.dirname(oldFullPath)
            const remaining = fs.readdirSync(oldDir).filter(n => !n.startsWith('.') && !IGNORED.has(n.toLowerCase()))
            if (remaining.length === 0) fs.rmdirSync(oldDir)
          } catch {}
        } catch (mvErr) {
          console.warn(`[RemoteMove] 이동 실패 ${relPath} → ${newRelPath}: ${mvErr.message}`)
        }
      }
    } catch (err) {
      console.warn('[RemoteMove] 처리 실패:', err.message)
    }

    this.saveState()
  }

  async start() {
    await this.syncStateWithServer()

    // Phase 1 디바이스 등록 + heartbeat 시작 (deviceDeps 있을 때만)
    if (this.deviceRegistry && this._deviceDeps) {
      try {
        await this.deviceRegistry.start({
          appVersion: this._deviceDeps.appVersion || 'unknown',
          deviceName: this._deviceDeps.deviceName,
        })
        // 원격 로그아웃 감지 시 콜백 — main.js 에서 로그아웃 플로우로 연결
        this.deviceRegistry.onRevoked(() => {
          if (this._deviceDeps.onRevoked) this._deviceDeps.onRevoked()
        })
      } catch (e) {
        console.warn('[DeviceRegistry] start failed (non-fatal):', e.message)
      }
    }

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

        // 원격 카테고리 변경 감시 폴링 (30초 간격)
        this.startRemoteSyncPolling()

        // 기존 자산 contentHash 백필 (1회, 백그라운드)
        this.startContentHashBackfill()

        // Phase 1 — 다운로드 폴링 (30초 간격). 서버에 새/변경된 자산 있으면 받아옴.
        this.startDownloadPolling()

        resolve()
      })
    })
  }

  // ── Phase 1 다운로드 폴링 ──
  // 30초마다 서버에 "since 이후 바뀐 내 자산" 물어봄. 있으면 로컬에 다운로드.
  // 다른 기기에서 올린 파일 → 여기로 내려옴 → atomicWrite → xattr 마킹 → 루프 방지.
  startDownloadPolling() {
    const INTERVAL_MS = 30 * 1000
    // state 에 마지막 폴링 시각 저장해서 앱 재시작 시에도 이어받음
    if (!this.state.downloadSince) this.state.downloadSince = null

    const tick = async () => {
      try {
        const { assets, nextSince } = await this.api.listAssetsSince(this.state.downloadSince, 200)
        if (Array.isArray(assets) && assets.length > 0) {
          for (const asset of assets) {
            try {
              await this.downloadRemoteAsset(asset)
            } catch (e) {
              console.warn(`[DownloadPoll] ${asset.fileName || asset.id} 실패:`, e.message)
            }
          }
        }
        this.state.downloadSince = nextSince
        this.saveState()
      } catch (e) {
        // 네트워크 오류 등은 조용히 무시, 다음 tick 에서 재시도
        if (process.env.ASSI_DEBUG_SYNC) console.warn('[DownloadPoll] tick error:', e.message)
      }
    }

    // 첫 tick 즉시 실행, 이후 주기 반복
    tick().catch(() => {})
    this._downloadTimer = setInterval(tick, INTERVAL_MS)
    if (this._downloadTimer.unref) this._downloadTimer.unref()
  }

  // 서버의 asset 1개를 로컬 폴더에 다운로드. 3중 방어선 적용.
  // Phase 1.5 — 이미지/영상/오디오/sourceFile(PDF 등) 모두 지원.
  // 500MB 초과는 pending 대기 (Phase 3 에서 다이얼로그 추가 예정, 지금은 로그만).
  async downloadRemoteAsset(asset) {
    if (!asset.url || !asset.fileName || !asset.projectId) return

    // 대용량(>500MB) 다운로드는 명시 동의 전까지 보류
    const LARGE_THRESHOLD = 500 * 1024 * 1024
    if (asset.fileSize && asset.fileSize > LARGE_THRESHOLD) {
      if (!this.state.largeDownloadApproved) this.state.largeDownloadApproved = {}
      if (!this.state.largeDownloadApproved[asset.id]) {
        if (process.env.ASSI_DEBUG_SYNC) {
          console.log(`[Download] skip large ${asset.fileName} (${fmt(asset.fileSize)}) — consent required`)
        }
        this.onFileStatus({
          path: asset.fileName, status: 'pending', progress: 0, fileName: asset.fileName,
          size: fmt(asset.fileSize), phase: `대용량 ${fmt(asset.fileSize)} — 다운로드 승인 필요`,
        })
        return
      }
    }

    // 어느 로컬 폴더로 받을지 — 프로젝트 경로 역산
    const project = await this.api.getProject(asset.projectId).catch(() => null)
    if (!project || project.uid !== this.uid) return

    const category = project.category || 'MISC'
    const projectName = project.name || asset.projectId
    // 폴더 규칙: watchDir/{카테고리}/{프로젝트명}/{파일명}
    const localDir = path.join(this.watchDir, category, projectName)
    const localPath = path.join(localDir, asset.fileName)
    const relPath = this.getRelPath(localPath)

    // 이미 동일 내용(해시) 있으면 스킵 (이미지·PDF 등 텍스트 해시 가능). 영상은 원본이 커서 해시 생략 가능성.
    if (fs.existsSync(localPath) && asset.contentHash) {
      try {
        const localHash = await this.computeFileHash(localPath)
        if (localHash === asset.contentHash) return
      } catch {}
    }

    const isVideoAsset = !!asset.isVideo || asset.fileType?.startsWith('video/')
    const isAudioAsset = asset.type === 'audio' || !!asset.isAudio || asset.fileType?.startsWith('audio/')
    const isPdfSource = asset.sourceFile && asset.sourceType === 'pdf'

    // 상태 안내
    this.onFileStatus({
      path: relPath, status: 'uploading', progress: 30, fileName: asset.fileName,
      isVideo: isVideoAsset, isAudio: isAudioAsset,
      size: asset.fileSize ? fmt(asset.fileSize) : '',
      phase: isPdfSource ? 'PDF 원본 다운로드 중...'
        : isVideoAsset ? '영상 다운로드 중...'
        : isAudioAsset ? '오디오 다운로드 중...'
        : '이미지 다운로드 중...',
    })

    // 다운로드 (Storage public URL — 영상도 원본 저장소라 바로 받음)
    const buffer = await this.api.downloadFile(asset.url)

    // atomicWrite 로 쓰면서 Layer 1/2 동시 마킹
    const { atomicWrite } = require('./atomic-write')
    await atomicWrite(localPath, buffer, {
      hash: asset.contentHash,
      recentlyDownloaded: this.recentlyDownloaded,
      xattrId: asset.id,
    })

    // state 에 기록 (업로드 루프 재방지 — 이미 동기화된 파일로 표시)
    this.state.syncedFiles[relPath] = {
      assetId: asset.id,
      projectId: asset.projectId,
      storagePath: asset.storagePath || '',
      syncedAt: new Date().toISOString(),
      fileSize: buffer.length,
      contentHash: asset.contentHash || null,
      downloaded: true,
    }
    this.saveState()

    this.onFileStatus({
      path: relPath,
      status: 'done',
      progress: 100,
      fileName: asset.fileName,
      isVideo: isVideoAsset,
      isAudio: isAudioAsset,
      size: fmt(buffer.length),
      phase: '다른 기기에서 받음',
      downloaded: true,
    })
  }

  // Phase 1.5 — 대용량 파일 다운로드 승인 (UI 버튼 클릭 시 호출)
  approveLargeDownload(assetId) {
    if (!this.state.largeDownloadApproved) this.state.largeDownloadApproved = {}
    this.state.largeDownloadApproved[assetId] = new Date().toISOString()
    this.saveState()
  }

  // ── Rename Detection ──

  bufferUnlink(filePath) {
    const relPath = this.getRelPath(filePath)
    const entry = this.state.syncedFiles[relPath]
    if (!entry) return // not synced, nothing to do

    const projectKey = this.getProjectKey(filePath)
    const isVid = isVideo(filePath)
    const fileName = path.basename(filePath)
    const fileSize = entry.fileSize || 0  // state에 캐시된 사이즈 (없으면 0)

    const timer = setTimeout(() => {
      // No matching add arrived → proceed with normal delete
      this.pendingUnlinks.delete(relPath)
      this.handleDelete(filePath)
    }, 3500) // awaitWriteFinish(2000ms) + 여유분

    this.pendingUnlinks.set(relPath, {
      filePath, projectKey, isVideo: isVid, entry, timer,
      fileName, fileSize, contentHash: entry.contentHash || null,
    })
  }

  // Fast path: chokidar의 unlink+add 쌍을 rename으로 인식.
  // 우선순위: (1) 같은 폴더+같은 fileName+같은 미디어타입,
  //           (2) 같은 fileName+같은 미디어타입 (cross-folder, 이름 동일),
  //           (3) 같은 fileSize+같은 미디어타입 (cross-folder + 이름까지 변경, fileSize 알 때만)
  // 매칭 못 잡아도 syncFile의 contentHash dedup이 slow path로 잡아주니 손실 0.
  tryMatchRename(newFilePath) {
    const newProjectKey = this.getProjectKey(newFilePath)
    if (!newProjectKey) return false

    const newIsVideo = isVideo(newFilePath)
    const newFileName = path.basename(newFilePath)

    let newFileSize = 0
    try { newFileSize = fs.statSync(newFilePath).size } catch {}

    // 후보 수집 (미디어 타입 일치 필수)
    const candidates = []
    for (const [oldRelPath, pending] of this.pendingUnlinks) {
      if (pending.isVideo !== newIsVideo) continue
      const sameFolder = pending.projectKey === newProjectKey
      const sameName = pending.fileName === newFileName
      const sameSize = newFileSize > 0 && pending.fileSize > 0 && pending.fileSize === newFileSize

      let priority
      if (sameFolder && sameName) priority = 1
      else if (sameName) priority = 2
      else if (sameSize) priority = 3
      else continue
      candidates.push({ oldRelPath, pending, priority })
    }
    if (candidates.length === 0) return false

    candidates.sort((a, b) => a.priority - b.priority)
    const best = candidates[0]
    clearTimeout(best.pending.timer)
    this.pendingUnlinks.delete(best.oldRelPath)
    this.handleFileRename(best.oldRelPath, newFilePath, best.pending.entry)
    return true
  }

  async handleFileRename(oldRelPath, newFilePath, oldEntry) {
    const newRelPath = this.getRelPath(newFilePath)
    const newFileName = path.basename(newFilePath)
    const oldFileName = path.basename(oldRelPath)
    const newProjectName = this.getProjectName(newFilePath)
    const newProjectKey = this.getProjectKey(newFilePath)
    const newCategory = this.getCategoryName(newFilePath)
    const oldProjectId = oldEntry.projectId

    // Cross-folder인지 판단
    const oldProjectKey = oldRelPath.split('/').slice(0, -1).join('/')
    const isCrossFolder = oldProjectKey !== newProjectKey
    const isVid = isVideo(newFilePath) || /\.(mp4|mov|avi|mkv|webm|m4v|wmv|flv)$/i.test(oldEntry.storagePath || '')

    console.log(`[Rename] File: ${oldFileName} → ${newFileName}${isCrossFolder ? ` (cross-folder: ${oldProjectKey} → ${newProjectKey})` : ''}`)

    try {
      let newProjectId = oldProjectId
      if (isCrossFolder && newProjectName && newProjectKey) {
        // 사용자가 직접 옮긴 행위 = 의도적이므로 새 폴더 자동 승인
        this.approvedFolders.add(newProjectKey)
        newProjectId = await this.findOrCreateProject(newProjectName, newProjectKey, newCategory)
      }

      if (isCrossFolder && newProjectId !== oldProjectId) {
        // moveAsset: projectId 변경 + 양쪽 카운터 ±1
        await this.api.moveAsset(oldEntry.assetId, newProjectId, newFileName !== oldFileName ? newFileName : undefined)

        // 새 프로젝트 썸네일 비어 있으면 채움 (이미지면 url, 영상이면 videoThumbnailUrl)
        try {
          const newProj = await this.api.getProject(newProjectId)
          if (newProj && !newProj.thumbnailUrl) {
            // asset 정보 직접 fetch는 비용 — oldEntry에 url이 캐시 안 돼 있으므로 storage url은 이미 알고 있음
            // 영상은 thumbnailUrl 없으면 그냥 둠 (다음 reorder/setVideoThumbnail에서 처리)
            // 이미지면 createAsset 시점의 url 재구성 어려움 → skip하고 다음 동기화에 맡김
          }
        } catch {}
      } else {
        // 같은 폴더 내 rename — 기존 동작 유지
        if (newFileName !== oldFileName) {
          await this.api.updateAsset(oldEntry.assetId, {
            fileName: newFileName,
            updatedAt: new Date().toISOString(),
          })
        }
      }

      // Update local state: remove old relPath, add new one with same references (projectId 갱신)
      delete this.state.syncedFiles[oldRelPath]
      this.state.syncedFiles[newRelPath] = {
        ...oldEntry,
        projectId: newProjectId,
        syncedAt: new Date().toISOString(),
      }
      this.saveState()

      this.onFileStatus({ path: newRelPath, status: 'renamed', fileName: newFileName, oldFileName, isVideo: isVid })
    } catch (err) {
      console.error(`[Rename] Failed: ${oldRelPath} → ${newRelPath}`, err.message)
      // Fallback: delete old asset, then sync the new file normally (contentHash dedup이 또 매칭 시도)
      try {
        try { await this.api.deleteFile(oldEntry.storagePath) } catch {}
        await this.api.deleteAsset(oldEntry.assetId)
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

  // ── Content-hash 백필 워커 ──
  // 앱 실행 시 1회 가동: state.syncedFiles 중 contentHash 없는 entry에 대해
  // 로컬 파일 sha256 계산 → state + Firestore 양쪽에 채워넣음.
  // 한 파일 처리 후 sleep 두어 CPU 점유 최소화.
  // 1000개 영상(평균 1GB) ≈ 30~40분 백그라운드 (한 번만 실행).
  startContentHashBackfill() {
    if (this._backfillRunning) return
    this._backfillRunning = true
    this._backfillStop = false
    ;(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      let processed = 0
      let updated = 0
      let failed = 0
      const startedAt = Date.now()

      try {
        const entries = Object.entries(this.state.syncedFiles)
        const targets = entries.filter(([, e]) => !e.contentHash)
        if (targets.length === 0) {
          console.log('[Backfill] No assets need contentHash backfill')
          return
        }
        console.log(`[Backfill] Starting contentHash backfill for ${targets.length} assets`)

        for (const [relPath, entry] of targets) {
          if (this._backfillStop) break
          processed++
          const fullPath = path.join(this.watchDir, ...relPath.split('/'))
          if (!fs.existsSync(fullPath)) {
            // 로컬 파일 없음 — skip (다음 sync에서 정리)
            await sleep(50)
            continue
          }
          try {
            const stat = fs.statSync(fullPath)
            const hash = await this.computeFileHash(fullPath)
            // Firestore 업데이트 (assetId가 유효한 경우만)
            if (entry.assetId) {
              try {
                await this.api.updateAsset(entry.assetId, {
                  contentHash: hash,
                  // fileSize도 함께 채워두면 fast-path rename 매칭에 도움
                })
              } catch (apiErr) {
                console.warn(`[Backfill] API update failed for ${relPath}: ${apiErr.message}`)
                failed++
                await sleep(500)
                continue
              }
            }
            // state 갱신
            this.state.syncedFiles[relPath] = {
              ...entry,
              contentHash: hash,
              fileSize: entry.fileSize || stat.size,
            }
            updated++
            // 5개마다 state 저장 (디스크 IO 절약)
            if (updated % 5 === 0) this.saveState()
          } catch (err) {
            console.warn(`[Backfill] Hash failed for ${relPath}: ${err.message}`)
            failed++
          }
          // CPU 양보 — 한 파일 처리 후 100ms 휴식 (큰 영상 후엔 자동으로 더 길어짐)
          await sleep(100)
        }
        this.saveState()
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
        console.log(`[Backfill] Done: ${updated} updated / ${failed} failed / ${processed} processed in ${elapsed}s`)
      } catch (err) {
        console.error('[Backfill] Worker crashed:', err.message)
      } finally {
        this._backfillRunning = false
      }
    })()
  }

  stopContentHashBackfill() {
    this._backfillStop = true
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

  startRemoteSyncPolling() {
    this.stopRemoteSyncPolling()
    this._remoteSyncTimer = setInterval(async () => {
      try {
        await this.syncStateWithServer()
      } catch {}
    }, 30000) // 30초
  }

  stopRemoteSyncPolling() {
    if (this._remoteSyncTimer) {
      clearInterval(this._remoteSyncTimer)
      this._remoteSyncTimer = null
    }
  }

  stopDownloadPolling() {
    if (this._downloadTimer) {
      clearInterval(this._downloadTimer)
      this._downloadTimer = null
    }
  }

  stop() {
    this.stopSharePolling()
    this.stopRemoteSyncPolling()
    this.stopContentHashBackfill()
    this.stopDownloadPolling()
    // Clear pending rename buffers
    for (const p of this.pendingUnlinks.values()) clearTimeout(p.timer)
    this.pendingUnlinks.clear()
    for (const p of this.pendingUnlinkDirs.values()) clearTimeout(p.timer)
    this.pendingUnlinkDirs.clear()
    this.watcher?.close()
    // Phase 0 방어선 정리
    this.recentlyDownloaded?.dispose()
    // Phase 1 디바이스 heartbeat 정리
    this.deviceRegistry?.stop()
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

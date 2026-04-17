// ASSI Sync — Keynote Data/ 이미지 추출 + 썸네일 생성
//
// 파서가 반환한 images 목록에서 선택적으로 추출.
// HEIC는 sharp libheif로 JPG 변환 (대표님 결정).
// 썸네일은 320px jpg (renderer에 file:// URL로 전달).

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { openArchive, scanEntries, readEntryBuffer } = require('./keynote-parser')

const THUMB_WIDTH = 320
const THUMB_QUALITY = 70
const UPLOAD_MAX_DIM = 4096
const UPLOAD_QUALITY = 88

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function isHeic(fileName) {
  return /\.(heic|heif)$/i.test(fileName)
}

function isImageFile(fileName) {
  return /\.(jpg|jpeg|png|heic|heif|tif|tiff|gif|webp|bmp)$/i.test(fileName)
}

// 대용량 이미지라도 스트리밍 쓰되, sharp는 Buffer 기반이라 일단 buffer 사용.
// 400MB 개별 이미지는 거의 없음 (Keynote는 alpha 미리 리사이즈하는 경향).
async function readData(zip, entry) {
  return readEntryBuffer(zip, entry)
}

// 원본 저장 (업로드용)
//  - HEIC → JPG 변환
//  - JPG/PNG 원본 > UPLOAD_MAX_DIM이면 리사이즈
//  - 그 외는 원본 그대로 복사
async function saveUploadImage(buffer, srcName, destDir) {
  ensureDir(destDir)
  const stem = srcName.replace(/\.[^.]+$/, '')
  if (isHeic(srcName)) {
    const outPath = path.join(destDir, `${stem}.jpg`)
    try {
      await sharp(buffer, { failOn: 'none' })
        .jpeg({ quality: UPLOAD_QUALITY })
        .toFile(outPath)
      return { path: outPath, originalName: srcName, finalName: path.basename(outPath), converted: true }
    } catch (e) {
      throw new Error(`HEIC decode failed for ${srcName}: ${e.message}`)
    }
  }
  // 일반 이미지: 크기 제한
  const ext = (srcName.match(/\.[^.]+$/) || ['.jpg'])[0].toLowerCase()
  const outPath = path.join(destDir, srcName)
  try {
    const meta = await sharp(buffer, { failOn: 'none' }).metadata()
    if ((meta.width || 0) > UPLOAD_MAX_DIM || (meta.height || 0) > UPLOAD_MAX_DIM) {
      await sharp(buffer, { failOn: 'none' })
        .resize(UPLOAD_MAX_DIM, UPLOAD_MAX_DIM, { fit: 'inside', withoutEnlargement: true })
        .toFile(outPath)
    } else {
      fs.writeFileSync(outPath, buffer)
    }
    return { path: outPath, originalName: srcName, finalName: srcName, converted: false }
  } catch (e) {
    // 메타데이터 읽기 실패 시 원본 그대로 복사
    fs.writeFileSync(outPath, buffer)
    return { path: outPath, originalName: srcName, finalName: srcName, converted: false }
  }
}

// 썸네일 (UI 렌더용)
async function saveThumbnail(buffer, srcName, destDir) {
  ensureDir(destDir)
  const stem = srcName.replace(/\.[^.]+$/, '')
  const outPath = path.join(destDir, `${stem}.jpg`)
  try {
    await sharp(buffer, { failOn: 'none' })
      .resize(THUMB_WIDTH, null, { fit: 'inside', withoutEnlargement: false })
      .jpeg({ quality: THUMB_QUALITY })
      .toFile(outPath)
    return outPath
  } catch (e) {
    // libheif가 특정 HEIC 못 읽으면 실패. skip.
    return null
  }
}

// ─── 메인: 세션 디렉토리에 extracted/ + thumbs/ 생성 ───
// parsed.images 를 기준으로 전부 추출 (선택적 subset은 추후 확장).
async function extractAllImages(keyFilePath, parsed, sessionDir, onProgress) {
  const extractedDir = path.join(sessionDir, 'extracted')
  const thumbsDir = path.join(sessionDir, 'thumbs')
  ensureDir(extractedDir)
  ensureDir(thumbsDir)

  const zip = await openArchive(keyFilePath)
  try {
    // 파일명 → entry 맵 빠르게 만들기
    const entries = await scanEntries(zip)
    const dataMap = new Map()
    for (const e of entries.data) dataMap.set(path.basename(e.fileName), e)

    const result = []
    let done = 0
    const total = parsed.images.filter(i => isImageFile(i.fileName)).length

    for (const img of parsed.images) {
      if (!isImageFile(img.fileName)) continue
      const entry = dataMap.get(img.fileName)
      if (!entry) { done++; continue }
      try {
        const buf = await readData(zip, entry)
        const uploadInfo = await saveUploadImage(buf, img.fileName, extractedDir)
        const thumbPath = await saveThumbnail(buf, img.fileName, thumbsDir)
        result.push({
          fileName: img.fileName,          // 파싱 시점 원본명
          finalName: uploadInfo.finalName,  // HEIC→jpg면 변환됨
          extractedPath: uploadInfo.path,
          thumbPath,                        // 실패 시 null
          size: buf.length,
          converted: uploadInfo.converted,
        })
      } catch (e) {
        console.warn('[KeynoteExtractor] extract failed:', img.fileName, e.message)
        result.push({
          fileName: img.fileName,
          finalName: img.fileName,
          extractedPath: null,
          thumbPath: null,
          size: 0,
          error: e.message,
        })
      }
      done++
      if (done % 5 === 0 || done === total) {
        onProgress?.({ phase: 'extract', done, total })
      }
    }
    return result
  } finally {
    try { zip.close() } catch {}
  }
}

module.exports = {
  extractAllImages,
  saveUploadImage,
  saveThumbnail,
  isHeic,
  isImageFile,
}

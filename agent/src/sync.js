import { readFile, stat } from 'fs/promises'
import { basename } from 'path'
import chalk from 'chalk'
import { config } from './config.js'
import { guessContentType, isImageFile, isVideoFile, getProjectName, getRelativePath } from './utils.js'
import { processImage } from './image-processor.js'
import { uploadToStorage, deleteFromStorage } from './uploader.js'
import { findOrCreateProject } from './project-manager.js'
import { createAsset, deleteAsset } from './asset-manager.js'
import { isFileSynced, markSynced, removeSynced } from './state.js'

const BUNNY_API_KEY = process.env.BUNNY_API_KEY || ''
const BUNNY_LIBRARY_ID = '631122'
const BUNNY_API_BASE = `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos`

async function uploadToBunny(buffer, fileName, projectId, assetId) {
  try {
    const createRes = await fetch(BUNNY_API_BASE, {
      method: 'POST',
      headers: { 'AccessKey': BUNNY_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `${projectId}_${fileName}` }),
    })
    const meta = await createRes.json()
    if (!meta.guid) throw new Error('Bunny create failed')

    const uploadRes = await fetch(`${BUNNY_API_BASE}/${meta.guid}`, {
      method: 'PUT',
      headers: { 'AccessKey': BUNNY_API_KEY, 'Content-Type': 'application/octet-stream' },
      body: buffer,
    })
    if (!uploadRes.ok) throw new Error(`Bunny upload failed (${uploadRes.status})`)

    const { getDb } = await import('./firebase.js')
    await getDb().collection('assets').doc(assetId).update({
      videoHost: 'bunny',
      bunnyVideoId: meta.guid,
      embedUrl: `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${meta.guid}`,
      bunnyStatus: 'processing',
      bunnyUploadedAt: new Date().toISOString(),
    })

    process.stdout.write(chalk.cyan(' → Bunny'))

    // 백그라운드 폴링: 인코딩 완료 → 썸네일 자동 저장
    pollBunnyEncoding(meta.guid, assetId, projectId, fileName)

    return meta.guid
  } catch (err) {
    process.stdout.write(chalk.yellow(` (Bunny skip: ${err.message})`))
    return null
  }
}

async function pollBunnyEncoding(bunnyVideoId, assetId, projectId, fileName) {
  const { getDb, getBucket } = await import('./firebase.js')
  const { config } = await import('./config.js')
  const db = getDb()
  const bucket = getBucket()

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 30000))
    try {
      const res = await fetch(`${BUNNY_API_BASE}/${bunnyVideoId}`, {
        headers: { 'AccessKey': BUNNY_API_KEY },
      })
      const info = await res.json()

      if (info.status === 4) {
        const thumbFile = info.thumbnailFileName || 'thumbnail.jpg'
        const thumbRes = await fetch(`https://vz-cd1dda72-832.b-cdn.net/${bunnyVideoId}/${thumbFile}`, {
          headers: { 'Referer': 'https://assifolio.com' },
        })
        if (thumbRes.ok) {
          const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer())
          const storagePath = `thumbnails/${config.uid}/${projectId}/${bunnyVideoId}.jpg`
          const file = bucket.file(storagePath)
          await file.save(thumbBuffer, {
            metadata: { contentType: 'image/jpeg', contentDisposition: 'inline' },
          })
          await file.makePublic()
          const videoThumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`
          await db.collection('assets').doc(assetId).update({
            bunnyStatus: 'ready', videoThumbnailUrl,
            bunnyEncodedAt: new Date().toISOString(),
          })
          const projDoc = await db.collection('projects').doc(projectId).get()
          if (projDoc.exists && !projDoc.data().thumbnailUrl) {
            await db.collection('projects').doc(projectId).update({ thumbnailUrl: videoThumbnailUrl })
          }
          console.log(chalk.green(`\n  ✓ [Bunny] ${fileName} 인코딩 완료, 썸네일 저장`))
        } else {
          await db.collection('assets').doc(assetId).update({ bunnyStatus: 'ready' })
        }
        return
      } else if (info.status === 5) {
        await db.collection('assets').doc(assetId).update({ bunnyStatus: 'error', bunnyError: 'Encoding failed' })
        console.log(chalk.red(`\n  ✗ [Bunny] ${fileName} 인코딩 실패`))
        return
      }
    } catch {}
  }
}

export async function syncFile(filePath) {
  const projectName = getProjectName(config.watchDir, filePath)
  if (!projectName) return null

  const relativePath = getRelativePath(config.watchDir, filePath)
  if (isFileSynced(relativePath)) return null

  const fileName = basename(filePath)
  const contentType = guessContentType(fileName)
  const isVideo = isVideoFile(fileName)
  const isImage = isImageFile(fileName)
  if (!isImage && !isVideo) return null

  try {
    // 프로젝트 찾기/생성
    const projectId = await findOrCreateProject(projectName)

    let buffer, compressedSize, originalSize
    if (isImage) {
      const result = await processImage(filePath)
      buffer = result.buffer
      originalSize = result.originalSize
      compressedSize = result.compressedSize
      const saved = result.skipped ? '' : ` (${fmt(originalSize)}→${fmt(compressedSize)})`
      process.stdout.write(chalk.gray(`  📷 ${relativePath}${saved}`))
    } else {
      buffer = await readFile(filePath)
      originalSize = buffer.length
      compressedSize = buffer.length
      process.stdout.write(chalk.blue(`  🎬 ${relativePath} (${fmt(originalSize)})`))
    }

    // Storage 업로드
    const storagePath = `users/${config.uid}/projects/${projectId}/${Date.now()}_${fileName}`

    // 영상: Firestore 문서 먼저 생성 (onVideoUpload 트리거가 문서를 찾아야 함)
    let assetId
    if (isVideo) {
      assetId = await createAsset({
        projectId, fileName, fileSize: compressedSize,
        fileType: contentType, isVideo: true,
        url: '', storagePath,
      })
    }

    const url = await uploadToStorage(buffer, storagePath, contentType)

    if (isVideo) {
      // URL 업데이트 + Bunny 직접 업로드
      const { getDb } = await import('./firebase.js')
      await getDb().collection('assets').doc(assetId).update({ url })
      await uploadToBunny(buffer, fileName, projectId, assetId)
    } else {
      assetId = await createAsset({
        projectId, fileName, fileSize: compressedSize,
        fileType: contentType, isVideo: false,
        url, storagePath,
      })
    }

    markSynced(relativePath, { assetId, projectId, storagePath })
    console.log(chalk.green(' ✓'))
    return { assetId, projectId }
  } catch (err) {
    console.log(chalk.red(` ✗ ${err.message}`))
    return null
  }
}

export async function unsyncFile(filePath) {
  const relativePath = getRelativePath(config.watchDir, filePath)
  const entry = removeSynced(relativePath)
  if (!entry) return

  try {
    await deleteFromStorage(entry.storagePath)
    await deleteAsset(entry.assetId, entry.storagePath, entry.storagePath.includes('video'), entry.projectId)
    console.log(chalk.yellow(`  🗑 ${relativePath} 삭제됨`))
  } catch (err) {
    console.log(chalk.red(`  ✗ 삭제 실패: ${relativePath} — ${err.message}`))
  }
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

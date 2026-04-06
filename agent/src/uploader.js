import { randomUUID } from 'crypto'
import { getBucket } from './firebase.js'

export async function uploadToStorage(buffer, storagePath, contentType) {
  const bucket = getBucket()
  const file = bucket.file(storagePath)
  const token = randomUUID()

  await file.save(buffer, {
    metadata: {
      contentType,
      contentDisposition: 'inline',
      metadata: { firebaseStorageDownloadTokens: token },
    },
  })

  // Firebase client SDK 호환 다운로드 URL 생성
  const encodedPath = encodeURIComponent(storagePath)
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`
  return url
}

export async function deleteFromStorage(storagePath) {
  const bucket = getBucket()
  try {
    await bucket.file(storagePath).delete()
  } catch (e) {
    if (e.code !== 404) throw e
  }
}

import admin from 'firebase-admin'
import { getDb } from './firebase.js'
import { config } from './config.js'

const { FieldValue } = admin.firestore

export async function createAsset({ projectId, fileName, fileSize, fileType, isVideo, url, storagePath }) {
  const db = getDb()

  const assetRef = await db.collection('assets').add({
    uid: config.uid,
    projectId,
    fileName,
    fileSize,
    fileType,
    isVideo,
    url,
    storagePath,
    createdAt: new Date().toISOString(),
  })

  // 프로젝트 카운터 업데이트
  const projectRef = db.collection('projects').doc(projectId)
  const updates = {
    [isVideo ? 'videoCount' : 'imageCount']: FieldValue.increment(1),
    updatedAt: new Date().toISOString(),
  }

  // 첫 이미지면 썸네일 설정
  const projectDoc = await projectRef.get()
  if (projectDoc.exists && !projectDoc.data().thumbnailUrl) {
    updates.thumbnailUrl = url
  }

  await projectRef.update(updates)
  return assetRef.id
}

export async function deleteAsset(assetId, storagePath, isVideo, projectId) {
  const db = getDb()

  await db.collection('assets').doc(assetId).delete()

  const projectRef = db.collection('projects').doc(projectId)
  await projectRef.update({
    [isVideo ? 'videoCount' : 'imageCount']: FieldValue.increment(-1),
    updatedAt: new Date().toISOString(),
  })
}

export async function findAssetByStoragePath(storagePath) {
  const db = getDb()
  const snap = await db.collection('assets')
    .where('storagePath', '==', storagePath)
    .limit(1)
    .get()
  if (snap.empty) return null
  return { id: snap.docs[0].id, ...snap.docs[0].data() }
}

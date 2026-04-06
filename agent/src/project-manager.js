import { getDb } from './firebase.js'
import { config } from './config.js'

const cache = new Map() // projectName → projectId

export async function findOrCreateProject(projectName) {
  if (cache.has(projectName)) return cache.get(projectName)

  const db = getDb()
  const snap = await db.collection('projects')
    .where('uid', '==', config.uid)
    .where('name', '==', projectName)
    .limit(1)
    .get()

  if (!snap.empty) {
    const id = snap.docs[0].id
    cache.set(projectName, id)
    return id
  }

  // 새 프로젝트 생성
  const docRef = await db.collection('projects').add({
    uid: config.uid,
    name: projectName,
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

  cache.set(projectName, docRef.id)
  return docRef.id
}

export function clearCache() {
  cache.clear()
}

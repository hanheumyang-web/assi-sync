// Vercel Serverless: Desktop Firestore operations (projects + assets)
// POST /api/desktop/firestore { action, ...params }
// Auth: Bearer <Firebase ID Token>

import { verifyAuth, db, FieldValue, cors } from '../_lib/admin.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let uid
  try { uid = await verifyAuth(req) }
  catch { return res.status(401).json({ error: 'Unauthorized' }) }

  const { action } = req.body
  const firestore = db()

  try {
    switch (action) {

      // ── Projects ──

      case 'findOrCreateProject': {
        const { name, category } = req.body
        // Find existing
        const snap = await firestore.collection('projects')
          .where('uid', '==', uid).where('name', '==', name).limit(1).get()
        if (!snap.empty) {
          const doc = snap.docs[0]
          // 카테고리 동기화: 폴더 구조에서 카테고리가 추출되었으면 업데이트
          if (category && doc.data().category !== category) {
            await doc.ref.update({ category, updatedAt: new Date().toISOString() })
          }
          return res.json({ projectId: doc.id })
        }

        // Check for name conflicts and increment
        let finalName = name
        let n = 2
        while (true) {
          const check = await firestore.collection('projects')
            .where('uid', '==', uid).where('name', '==', finalName).limit(1).get()
          if (check.empty) break
          finalName = `${name} (${n})`
          n++
        }

        const docRef = await firestore.collection('projects').add({
          uid, name: finalName, client: '', category: category || 'FASHION',
          shootDate: null, embargoDate: null, embargoStatus: 'none',
          imageCount: 0, videoCount: 0, thumbnailUrl: null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        })
        return res.json({ projectId: docRef.id, name: finalName })
      }

      case 'updateProject': {
        const { projectId, data } = req.body
        // Security: verify project belongs to this user
        const projDoc = await firestore.collection('projects').doc(projectId).get()
        if (!projDoc.exists || projDoc.data().uid !== uid)
          return res.status(403).json({ error: 'Forbidden' })

        const updateData = { ...data, updatedAt: new Date().toISOString() }
        // Handle FieldValue.increment
        if (data._increments) {
          for (const [field, val] of Object.entries(data._increments)) {
            updateData[field] = FieldValue.increment(val)
          }
          delete updateData._increments
        }
        await firestore.collection('projects').doc(projectId).update(updateData)
        return res.json({ ok: true })
      }

      case 'deleteProject': {
        const { projectId } = req.body
        const projDoc = await firestore.collection('projects').doc(projectId).get()
        if (!projDoc.exists || projDoc.data().uid !== uid)
          return res.status(403).json({ error: 'Forbidden' })
        await firestore.collection('projects').doc(projectId).delete()
        return res.json({ ok: true })
      }

      case 'getProject': {
        const { projectId } = req.body
        const projDoc = await firestore.collection('projects').doc(projectId).get()
        if (!projDoc.exists || projDoc.data().uid !== uid)
          return res.status(403).json({ error: 'Not found' })
        return res.json({ id: projDoc.id, ...projDoc.data() })
      }

      // ── Assets ──

      case 'createAsset': {
        const { data } = req.body
        if (data.uid !== uid) return res.status(403).json({ error: 'Forbidden' })
        const assetRef = await firestore.collection('assets').add(data)
        return res.json({ assetId: assetRef.id })
      }

      case 'updateAsset': {
        const { assetId, data } = req.body
        // verify ownership
        const assetDoc = await firestore.collection('assets').doc(assetId).get()
        if (!assetDoc.exists || assetDoc.data().uid !== uid)
          return res.status(403).json({ error: 'Forbidden' })
        await firestore.collection('assets').doc(assetId).update(data)
        return res.json({ ok: true })
      }

      case 'deleteAsset': {
        const { assetId } = req.body
        const assetDoc = await firestore.collection('assets').doc(assetId).get()
        if (!assetDoc.exists || assetDoc.data().uid !== uid)
          return res.status(403).json({ error: 'Forbidden' })
        await firestore.collection('assets').doc(assetId).delete()
        return res.json({ ok: true })
      }

      // ── Queries ──

      case 'getProjectsByUid': {
        const snap = await firestore.collection('projects')
          .where('uid', '==', uid).get()
        const projects = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        return res.json({ projects })
      }

      case 'getAssetsByProject': {
        const { projectId } = req.body
        const snap = await firestore.collection('assets')
          .where('projectId', '==', projectId).get()
        const assets = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        return res.json({ assets })
      }

      // ── Share Upload (무압축 공유) ──

      case 'getPendingShares': {
        // uid 단일 조건만 사용 (복합 인덱스 불필요)
        const snap = await firestore.collection('shares')
          .where('uid', '==', uid)
          .get()
        const shares = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(s => s.status === 'pending_upload')
        return res.json({ shares })
      }

      case 'updateShareProgress': {
        const { shareId, assetId, uploadStatus, uploadedCount, status } = req.body
        const shareDoc = await firestore.collection('shares').doc(shareId).get()
        if (!shareDoc.exists || shareDoc.data().uid !== uid)
          return res.status(403).json({ error: 'Forbidden' })

        const updates = {}

        // 개별 asset 상태 업데이트
        if (assetId && uploadStatus) {
          const assets = shareDoc.data().assets || []
          const idx = assets.findIndex(a => a.id === assetId)
          if (idx >= 0) {
            assets[idx].uploadStatus = uploadStatus
            updates.assets = assets
          }
        }

        if (uploadedCount !== undefined) updates.uploadedCount = uploadedCount
        if (status) updates.status = status

        if (Object.keys(updates).length > 0) {
          await firestore.collection('shares').doc(shareId).update(updates)
        }
        return res.json({ ok: true })
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` })
    }
  } catch (err) {
    console.error(`[Firestore API] ${action} error:`, err)
    return res.status(500).json({ error: err.message })
  }
}

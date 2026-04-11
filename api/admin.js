// Vercel Serverless: Admin API
// Only accessible by admin UID

import { verifyAuth, db, bucket, cors } from './_lib/admin.js'
import { getAuth } from 'firebase-admin/auth'

const ADMIN_UIDS = (process.env.ADMIN_UIDS || 'cCVr5wf09kTebTUThc0SMPasZ3g1').split(',').filter(Boolean)

async function verifyAdmin(req) {
  const uid = await verifyAuth(req)
  if (!ADMIN_UIDS.includes(uid)) throw new Error('Forbidden')
  return uid
}

// Firestore batch는 500개 제한 — 청크 처리
async function batchDelete(firestore, docs) {
  for (let i = 0; i < docs.length; i += 400) {
    const batch = firestore.batch()
    docs.slice(i, i + 400).forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
}

export default async function handler(req, res) {
  cors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let adminUid
  try {
    adminUid = await verifyAdmin(req)
  } catch (e) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const { action } = req.body || {}
  const firestore = db()

  try {
    // ── 통계 ──
    if (action === 'getStats') {
      const [usersCount, projectsCount, assetsCount, portfoliosSnap] = await Promise.all([
        firestore.collection('users').count().get(),
        firestore.collection('projects').count().get(),
        firestore.collection('assets').count().get(),
        firestore.collection('portfolios').get(),
      ])

      const totalUsers = usersCount.data().count
      const totalProjects = projectsCount.data().count
      const totalAssets = assetsCount.data().count
      const publishedPortfolios = portfoliosSnap.docs.filter(d => d.data().published).length
      const totalPortfolios = portfoliosSnap.size

      // 최근 7일 가입자 (users 컬렉션에서 최근 것만)
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      const recentSnap = await firestore.collection('users')
        .where('createdAt', '>=', weekAgo)
        .count().get()
      const recentUsers = recentSnap.data().count

      return res.json({
        totalUsers, totalProjects, totalAssets,
        publishedPortfolios, totalPortfolios,
        recentUsers,
        avgProjectsPerUser: totalUsers ? +(totalProjects / totalUsers).toFixed(1) : 0,
      })
    }

    // ── 유저 목록 ──
    if (action === 'getUsers') {
      const usersSnap = await firestore.collection('users').get()
      const projectsSnap = await firestore.collection('projects').get()
      const portfoliosSnap = await firestore.collection('portfolios').get()

      // 유저별 프로젝트 수
      const projectCount = {}
      projectsSnap.docs.forEach(d => {
        const uid = d.data().uid
        projectCount[uid] = (projectCount[uid] || 0) + 1
      })

      // 포트폴리오 published 상태
      const portfolioStatus = {}
      portfoliosSnap.docs.forEach(d => {
        portfolioStatus[d.id] = d.data().published || false
      })

      // Auth 유저 정보
      const authUsers = {}
      let nextPageToken
      do {
        const listResult = await getAuth().listUsers(1000, nextPageToken)
        listResult.users.forEach(u => {
          authUsers[u.uid] = {
            disabled: u.disabled,
            lastSignIn: u.metadata.lastSignInTime,
            creationTime: u.metadata.creationTime,
            providerData: u.providerData.map(p => p.providerId),
          }
        })
        nextPageToken = listResult.pageToken
      } while (nextPageToken)

      const users = usersSnap.docs.map(d => {
        const data = d.data()
        const uid = d.id
        const authInfo = authUsers[uid] || {}
        return {
          uid,
          displayName: data.displayName || '',
          email: data.email || '',
          profession: data.profession || '',
          photoURL: data.photoURL || '',
          createdAt: data.createdAt?.toDate?.()?.toISOString() || authInfo.creationTime || '',
          lastSignIn: authInfo.lastSignIn || '',
          disabled: authInfo.disabled || false,
          providers: authInfo.providerData || [],
          projectCount: projectCount[uid] || 0,
          portfolioPublished: portfolioStatus[uid] || false,
        }
      })

      return res.json({ users })
    }

    // ── 유저 상세 ──
    if (action === 'getUserDetail') {
      const { uid } = req.body
      if (!uid || typeof uid !== 'string' || uid.length > 128) return res.status(400).json({ error: 'Invalid uid' })

      const userDoc = await firestore.collection('users').doc(uid).get()
      const projectsSnap = await firestore.collection('projects').where('uid', '==', uid).get()
      const assetsSnap = await firestore.collection('assets').where('uid', '==', uid).get()
      const portfolioDoc = await firestore.collection('portfolios').doc(uid).get()

      let authUser = null
      try { authUser = await getAuth().getUser(uid) } catch (e) { console.error('[Admin] getUser:', e.message) }

      // 필요한 필드만 추출
      const userData = userDoc.exists ? {
        uid,
        displayName: userDoc.data().displayName || '',
        email: userDoc.data().email || '',
        profession: userDoc.data().profession || '',
        photoURL: userDoc.data().photoURL || '',
        bio: userDoc.data().bio || '',
        createdAt: userDoc.data().createdAt?.toDate?.()?.toISOString() || '',
      } : null

      const portfolioData = portfolioDoc.exists ? {
        slug: portfolioDoc.data().slug || '',
        published: portfolioDoc.data().published || false,
        columns: portfolioDoc.data().columns || 3,
      } : null

      return res.json({
        user: userData,
        projects: projectsSnap.docs.map(d => ({
          id: d.id,
          name: d.data().name || '',
          category: d.data().category || '',
          createdAt: d.data().createdAt?.toDate?.()?.toISOString() || '',
        })),
        assets: assetsSnap.docs.map(d => ({
          id: d.id,
          name: d.data().name || '',
          type: d.data().type || '',
          size: d.data().size || 0,
        })),
        portfolio: portfolioData,
        auth: authUser ? {
          disabled: authUser.disabled,
          lastSignIn: authUser.metadata.lastSignInTime,
          creationTime: authUser.metadata.creationTime,
        } : null,
        totalStorageEstimate: assetsSnap.docs.reduce((sum, d) => sum + (d.data().size || 0), 0),
      })
    }

    // ── 유저 정지 (disable) ──
    if (action === 'disableUser') {
      const { uid, disabled } = req.body
      if (!uid || typeof uid !== 'string') return res.status(400).json({ error: 'Invalid uid' })
      if (ADMIN_UIDS.includes(uid)) return res.status(400).json({ error: '어드민 계정은 정지할 수 없습니다' })
      if (typeof disabled !== 'boolean') return res.status(400).json({ error: 'disabled must be boolean' })
      await getAuth().updateUser(uid, { disabled })
      return res.json({ success: true, disabled })
    }

    // ── 유저 삭제 ──
    if (action === 'deleteUser') {
      const { uid } = req.body
      if (!uid || typeof uid !== 'string') return res.status(400).json({ error: 'Invalid uid' })
      if (ADMIN_UIDS.includes(uid)) return res.status(400).json({ error: '어드민 계정은 삭제할 수 없습니다' })

      const errors = []

      // 1. Delete assets (batch 400씩)
      try {
        const assetsSnap = await firestore.collection('assets').where('uid', '==', uid).get()
        await batchDelete(firestore, assetsSnap.docs)
      } catch (e) { errors.push('assets: ' + e.message) }

      // 2. Delete projects
      try {
        const projectsSnap = await firestore.collection('projects').where('uid', '==', uid).get()
        await batchDelete(firestore, projectsSnap.docs)
      } catch (e) { errors.push('projects: ' + e.message) }

      // 3. Delete portfolio
      try { await firestore.collection('portfolios').doc(uid).delete() }
      catch (e) { errors.push('portfolio: ' + e.message) }

      // 4. Delete user doc
      try { await firestore.collection('users').doc(uid).delete() }
      catch (e) { errors.push('userDoc: ' + e.message) }

      // 5. Delete Auth user
      try { await getAuth().deleteUser(uid) }
      catch (e) { errors.push('auth: ' + e.message) }

      // 6. Delete storage files
      try {
        const b = bucket()
        await b.deleteFiles({ prefix: `users/${uid}/` })
        await b.deleteFiles({ prefix: `thumbnails/${uid}/` })
      } catch (e) { errors.push('storage: ' + e.message) }

      return res.json({ success: true, deleted: uid, errors: errors.length ? errors : undefined })
    }

    return res.status(400).json({ error: 'Unknown action' })

  } catch (err) {
    console.error('[Admin API]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

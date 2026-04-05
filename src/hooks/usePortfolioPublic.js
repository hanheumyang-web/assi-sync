import { useState, useEffect } from 'react'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'

export function usePortfolioPublic(slug) {
  const [portfolio, setPortfolio] = useState(null)
  const [profile, setProfile] = useState(null)
  const [projects, setProjects] = useState([])
  const [projectAssets, setProjectAssets] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!slug) { setLoading(false); return }

    const load = async () => {
      try {
        // 1. slug로 포트폴리오 조회
        const pQ = query(collection(db, 'portfolios'), where('slug', '==', slug), where('published', '==', true))
        const pSnap = await getDocs(pQ)
        if (pSnap.empty) {
          setError('not_found')
          setLoading(false)
          return
        }
        const pDoc = pSnap.docs[0]
        const pData = { id: pDoc.id, ...pDoc.data() }
        setPortfolio(pData)

        // 2. 유저 프로필 + 프로젝트 병렬 로드
        const [uSnap, projSnap] = await Promise.all([
          getDoc(doc(db, 'users', pData.uid)),
          getDocs(query(
            collection(db, 'projects'),
            where('uid', '==', pData.uid),
            where('portfolioPublic', '==', true)
          )),
        ])

        if (uSnap.exists()) setProfile(uSnap.data())

        const projMap = {}
        projSnap.docs.forEach(d => { projMap[d.id] = { id: d.id, ...d.data() } })

        // projectOrder 순서대로 정렬, 없는 건 제외
        const ordered = (pData.projectOrder || [])
          .filter(pid => projMap[pid])
          .map(pid => projMap[pid])
        setProjects(ordered)

        // 3. 모든 프로젝트 에셋 병렬 로드
        const assetResults = await Promise.all(
          ordered.map(proj =>
            getDocs(query(collection(db, 'assets'), where('projectId', '==', proj.id)))
              .then(snap => [proj.id, snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))])
          )
        )
        const assetMap = Object.fromEntries(assetResults)
        setProjectAssets(assetMap)
        setLoading(false)
      } catch (e) {
        console.error('[Portfolio] Load error:', e)
        setError('error')
        setLoading(false)
      }
    }
    load()
  }, [slug])

  return { portfolio, profile, projects, projectAssets, loading, error }
}

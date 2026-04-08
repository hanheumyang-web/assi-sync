import { useState, useEffect, useCallback } from 'react'
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'

const DEFAULT_PORTFOLIO = {
  columns: 3,
  backgroundColor: '#FFFFFF',
  textColor: '#1A1A1A',
  accentColor: '#F4A259',
  rowAspectRatio: 0.667,
  businessName: '',
  tagline: '',
  contactEmail: '',
  contactPhone: '',
  showInstagram: true,
  showWebsite: true,
  projectOrder: [],
  enabledCategories: [],
  published: false,
  slug: '',
}

export function usePortfolio() {
  const { user, userDoc } = useAuth()
  const [portfolio, setPortfolio] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setPortfolio(null); setLoading(false); return }

    const load = async () => {
      const ref = doc(db, 'portfolios', user.uid)
      const snap = await getDoc(ref)
      if (snap.exists()) {
        setPortfolio({ id: snap.id, ...snap.data() })
      } else {
        // 아직 포트폴리오 없음 → 기본값
        setPortfolio({ id: user.uid, ...DEFAULT_PORTFOLIO, uid: user.uid })
      }
      setLoading(false)
    }
    load()
  }, [user])

  const savePortfolio = useCallback(async (updates) => {
    if (!user) return
    try {
      const ref = doc(db, 'portfolios', user.uid)
      const snap = await getDoc(ref)
      const data = {
        ...updates,
        uid: user.uid,
        published: true,
        updatedAt: new Date().toISOString(),
      }
      if (!snap.exists()) {
        data.createdAt = new Date().toISOString()
        await setDoc(ref, { ...DEFAULT_PORTFOLIO, ...data })
      } else {
        await updateDoc(ref, data)
      }

      // projectOrder의 프로젝트에 portfolioPublic 플래그 동기화
      const projectOrder = updates.projectOrder || []
      if (projectOrder.length > 0) {
        const batch = writeBatch(db)
        const oldQ = query(collection(db, 'projects'), where('uid', '==', user.uid), where('portfolioPublic', '==', true))
        const oldSnap = await getDocs(oldQ)
        oldSnap.docs.forEach(d => batch.update(d.ref, { portfolioPublic: false }))
        // 존재하는 프로젝트만 업데이트
        for (const pid of projectOrder) {
          const pRef = doc(db, 'projects', pid)
          const pSnap = await getDoc(pRef)
          if (pSnap.exists()) {
            batch.update(pRef, { portfolioPublic: true })
          }
        }
        await batch.commit()
      }

      setPortfolio(prev => ({ ...prev, ...data }))
    } catch (err) {
      console.error('[Portfolio Save Error]', err.code, err.message)
      throw err
    }
  }, [user])

  // 슬러그 고유성 확인
  const checkSlugAvailable = useCallback(async (slug) => {
    if (!slug) return false
    const q = query(collection(db, 'portfolios'), where('slug', '==', slug))
    const snap = await getDocs(q)
    // 자기 자신 제외
    return snap.docs.every(d => d.id === user?.uid)
  }, [user])

  // 발행 시 프로젝트에 portfolioPublic 플래그 동기화
  const publishPortfolio = useCallback(async (projectOrder) => {
    if (!user) return
    const batch = writeBatch(db)

    // 기존 portfolioPublic 프로젝트 해제
    const oldQ = query(collection(db, 'projects'), where('uid', '==', user.uid), where('portfolioPublic', '==', true))
    const oldSnap = await getDocs(oldQ)
    oldSnap.docs.forEach(d => batch.update(d.ref, { portfolioPublic: false }))

    // 새로 포함된 프로젝트에 portfolioPublic 설정 (존재하는 것만)
    for (const pid of projectOrder) {
      const pRef = doc(db, 'projects', pid)
      const pSnap = await getDoc(pRef)
      if (pSnap.exists()) {
        batch.update(pRef, { portfolioPublic: true })
      }
    }

    // 포트폴리오 발행
    const pRef = doc(db, 'portfolios', user.uid)
    batch.update(pRef, { published: true, projectOrder, updatedAt: new Date().toISOString() })

    await batch.commit()
    setPortfolio(prev => ({ ...prev, published: true, projectOrder }))
  }, [user])

  const unpublishPortfolio = useCallback(async () => {
    if (!user) return
    await updateDoc(doc(db, 'portfolios', user.uid), { published: false, updatedAt: new Date().toISOString() })
    setPortfolio(prev => ({ ...prev, published: false }))
  }, [user])

  return { portfolio, loading, savePortfolio, checkSlugAvailable, publishPortfolio, unpublishPortfolio }
}

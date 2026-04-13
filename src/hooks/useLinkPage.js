import { useState, useEffect, useCallback } from 'react'
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'

const DEFAULT_LINKPAGE = {
  // 프로필
  profileName: '',
  profileRole: '',
  contactEmail: '',
  contactPhone: '',
  bio: '',
  showEmail: true,
  showPhone: true,
  showRole: true,
  showBio: false,

  // 스타일
  backgroundColor: '#FFFFFF',
  textColor: '#1A1A1A',
  accentColor: '#F4A259',
  profileFrame: 'circle', // circle | rounded | square | hexagon
  headerLayout: 'center', // center | left | cover | minimal
  fontFamily: 'Inter',

  // 타일 설정
  columns: 3,
  tileGap: 3,
  tileRadius: 3,
  tileRatio: '1', // '1' | '4/5' | '3/2'

  // 타일 데이터 (순서대로)
  tiles: [],

  // 배포
  slug: '',
  published: false,
  publishedAt: null,
}

/**
 * 타일 데이터 구조:
 * {
 *   id: string (nanoid),
 *   type: 'project' | 'category' | 'link' | 'template' | 'portfolio' | 'image' | 'video',
 *   // project: { projectId, name, thumbnailUrl }
 *   // category: { category, count, color }
 *   // link: { service, url, label } — service: instagram|tiktok|youtube|vimeo|website|email
 *   // template: { templateId, label, bgColor, isDark }
 *   // portfolio: {} (전체보기)
 *   // image: { url, storagePath }
 *   // video: { url, storagePath }
 * }
 */

let _idCounter = 0
function makeId() {
  return Date.now().toString(36) + (++_idCounter).toString(36)
}

export { DEFAULT_LINKPAGE, makeId }

export function useLinkPage() {
  const { user, userDoc } = useAuth()
  const [linkPage, setLinkPage] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLinkPage(null); setLoading(false); return }

    const load = async () => {
      const ref = doc(db, 'linkpages', user.uid)
      const snap = await getDoc(ref)
      if (snap.exists()) {
        setLinkPage({ id: snap.id, ...snap.data() })
      } else {
        // 기본값 + 유저 정보 자동 채우기
        setLinkPage({
          id: user.uid,
          ...DEFAULT_LINKPAGE,
          uid: user.uid,
          profileName: userDoc?.displayName || user.displayName || '',
          profileRole: userDoc?.profession || '',
          contactEmail: user.email || '',
        })
      }
      setLoading(false)
    }
    load()
  }, [user, userDoc])

  // 초안 저장 (draft 서브필드)
  const saveLinkPage = useCallback(async (updates) => {
    if (!user) return
    try {
      const ref = doc(db, 'linkpages', user.uid)
      const draftData = { ...updates, updatedAt: new Date().toISOString() }
      const snap = await getDoc(ref)
      if (!snap.exists()) {
        await setDoc(ref, {
          ...DEFAULT_LINKPAGE,
          uid: user.uid,
          createdAt: new Date().toISOString(),
          draft: draftData,
        })
      } else {
        await updateDoc(ref, { draft: draftData })
      }
      // 로컬 상태 업데이트
      setLinkPage(prev => prev ? { ...prev, draft: draftData, ...updates } : prev)
    } catch (err) {
      console.error('링크페이지 저장 실패:', err)
    }
  }, [user])

  // 배포 (draft → top-level)
  const deployLinkPage = useCallback(async () => {
    if (!user || !linkPage) return
    try {
      const ref = doc(db, 'linkpages', user.uid)
      const snap = await getDoc(ref)
      if (!snap.exists()) return
      const data = snap.data()
      const draft = data.draft || {}
      await updateDoc(ref, {
        ...draft,
        published: true,
        publishedAt: new Date().toISOString(),
      })
      setLinkPage(prev => prev ? { ...prev, ...draft, published: true } : prev)
    } catch (err) {
      console.error('링크페이지 배포 실패:', err)
    }
  }, [user, linkPage])

  // 배포 해제
  const unpublishLinkPage = useCallback(async () => {
    if (!user) return
    try {
      const ref = doc(db, 'linkpages', user.uid)
      await updateDoc(ref, { published: false })
      setLinkPage(prev => prev ? { ...prev, published: false } : prev)
    } catch (err) {
      console.error('링크페이지 비공개 실패:', err)
    }
  }, [user])

  // slug 중복 확인
  const checkSlugAvailable = useCallback(async (slug) => {
    if (!slug) return false
    const q = query(collection(db, 'linkpages'), where('slug', '==', slug))
    const snap = await getDocs(q)
    // 자기 자신은 허용
    return snap.empty || snap.docs.every(d => d.id === user?.uid)
  }, [user])

  return {
    linkPage,
    loading,
    saveLinkPage,
    deployLinkPage,
    unpublishLinkPage,
    checkSlugAvailable,
  }
}

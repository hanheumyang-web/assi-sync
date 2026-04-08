import { createContext, useContext, useState, useEffect } from 'react'
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { auth, db, googleProvider } from '../firebase'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userDoc, setUserDoc] = useState(null)
  const [docLoadError, setDocLoadError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 모바일 리다이렉트 로그인 결과 처리
    getRedirectResult(auth).catch(err => {
      console.error('Redirect login error:', err)
    })
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setUser(firebaseUser)
          const ref = doc(db, 'users', firebaseUser.uid)
          try {
            const snap = await getDoc(ref)
            if (snap.exists()) {
              setUserDoc(snap.data())
              setDocLoadError(false)
            } else {
              setUserDoc(null) // 신규 유저 → 온보딩
              setDocLoadError(false)
            }
          } catch (err) {
            console.error('userDoc 로드 실패:', err)
            setUserDoc(null)
            setDocLoadError(true) // 네트워크 에러 — 온보딩 표시 금지
          }
        } else {
          setUser(null)
          setUserDoc(null)
          setDocLoadError(false)
        }
      } finally {
        setLoading(false)
      }
    })
    return unsub
  }, [])

  const loginWithGoogle = async () => {
    // iOS Safari의 ITP는 cross-domain redirect(firebaseapp.com↔vercel.app) 쿠키를 차단하므로
    // popup을 기본으로 쓰고, popup이 완전히 막힌 환경(인앱 브라우저 등)에서만 redirect 폴백.
    try {
      const result = await signInWithPopup(auth, googleProvider)
      return result.user
    } catch (err) {
      if (
        err.code === 'auth/popup-blocked' ||
        err.code === 'auth/operation-not-supported-in-this-environment'
      ) {
        await signInWithRedirect(auth, googleProvider)
        return null
      }
      throw err
    }
  }

  const logout = async () => {
    await signOut(auth)
  }

  const createUserDoc = async (profileData) => {
    if (!user) return
    const ref = doc(db, 'users', user.uid)
    // 기존 문서 덮어쓰기 방지 — 이미 있으면 로드만 하고 반환
    const existing = await getDoc(ref)
    if (existing.exists()) {
      const data = existing.data()
      setUserDoc(data)
      return data
    }
    const newDoc = {
      uid: user.uid,
      email: user.email,
      displayName: profileData.name,
      profession: profileData.profession,
      logoUrl: profileData.logoUrl || null,
      instagram: null,
      projects: [],
      createdAt: new Date().toISOString(),
      plan: 'free',
    }
    await setDoc(ref, newDoc)
    setUserDoc(newDoc)
    return newDoc
  }

  const updateUserProfile = async (updates) => {
    if (!user) return
    const ref = doc(db, 'users', user.uid)
    await updateDoc(ref, { ...updates, updatedAt: new Date().toISOString() })
    setUserDoc(prev => ({ ...prev, ...updates }))
  }

  const value = {
    user,
    userDoc,
    docLoadError,
    loading,
    loginWithGoogle,
    logout,
    createUserDoc,
    updateUserProfile,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

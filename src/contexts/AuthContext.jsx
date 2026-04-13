import { createContext, useContext, useState, useEffect } from 'react'
import { onAuthStateChanged, signInWithPopup, signInWithCredential, GoogleAuthProvider, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { auth, db, googleProvider } from '../firebase'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

const GOOGLE_CLIENT_ID = '757456971987-29ujju69cskatfiea8c4kn4upbtv71d8.apps.googleusercontent.com'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userDoc, setUserDoc] = useState(null)
  const [docLoadError, setDocLoadError] = useState(false)
  const [loading, setLoading] = useState(true)

  // Android Google OAuth 콜백 처리 (페이지 로드 시 URL hash에서 id_token 확인)
  useEffect(() => {
    const hash = window.location.hash
    if (hash && hash.includes('id_token=')) {
      const params = new URLSearchParams(hash.substring(1))
      const idToken = params.get('id_token')
      if (idToken) {
        const credential = GoogleAuthProvider.credential(idToken)
        signInWithCredential(auth, credential)
          .then(() => {
            // URL 정리 → 메인 페이지로
            window.history.replaceState(null, '', '/')
          })
          .catch((err) => {
            console.error('Google credential 로그인 실패:', err)
            window.history.replaceState(null, '', '/')
          })
      }
    }
  }, [])

  useEffect(() => {
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
              setUserDoc(null)
              setDocLoadError(false)
            }
          } catch (err) {
            console.error('userDoc 로드 실패:', err)
            setUserDoc(null)
            setDocLoadError(true)
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
    const isAndroid = /Android/i.test(navigator.userAgent)
    if (isAndroid) {
      // Android: Firebase 핸들러 완전 우회
      // 이미 Google Cloud Console에 등록된 redirect URI 사용
      const nonce = crypto.randomUUID()
      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: 'https://assifolio.com/__/auth/handler',
        response_type: 'id_token',
        scope: 'openid email profile',
        nonce: nonce,
        prompt: 'select_account',
      })
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
      return null
    }
    // iOS / 데스크톱: Firebase popup (authDomain=firebaseapp.com → Firebase 서버 직접)
    const result = await signInWithPopup(auth, googleProvider)
    return result.user
  }

  const logout = async () => {
    await signOut(auth)
  }

  const createUserDoc = async (profileData) => {
    if (!user) return
    const ref = doc(db, 'users', user.uid)
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

import { createContext, useContext, useState, useEffect } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { auth, db, googleProvider } from '../firebase'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userDoc, setUserDoc] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        // Firestore에서 유저 문서 로드
        const ref = doc(db, 'users', firebaseUser.uid)
        const snap = await getDoc(ref)
        if (snap.exists()) {
          setUserDoc(snap.data())
        } else {
          setUserDoc(null) // 신규 유저 → 온보딩 필요
        }
      } else {
        setUser(null)
        setUserDoc(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const loginWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider)
    return result.user
  }

  const logout = async () => {
    await signOut(auth)
  }

  const createUserDoc = async (profileData) => {
    if (!user) return
    const ref = doc(db, 'users', user.uid)
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

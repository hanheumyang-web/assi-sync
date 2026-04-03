import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: "AIzaSyD-JUPcZ5iIIBEtoCE7YPye0PRP4WTPGgg",
  authDomain: "assi-app-6ea04.firebaseapp.com",
  projectId: "assi-app-6ea04",
  storageBucket: "assi-app-6ea04.firebasestorage.app",
  messagingSenderId: "757456971987",
  appId: "1:757456971987:web:ba682182adee6c0f594c26"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const googleProvider = new GoogleAuthProvider()

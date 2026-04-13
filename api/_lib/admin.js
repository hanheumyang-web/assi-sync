// Shared Firebase Admin SDK initialization for Vercel serverless functions
// Service account key is stored as FIREBASE_SERVICE_ACCOUNT_KEY env var (JSON string)

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

const STORAGE_BUCKET = 'assi-app-6ea04.firebasestorage.app'

function ensureInit() {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY env var')
  const sa = JSON.parse(raw)
  initializeApp({ credential: cert(sa), storageBucket: STORAGE_BUCKET })
}

export async function verifyAuth(req) {
  ensureInit()
  const h = req.headers.authorization
  if (!h || !h.startsWith('Bearer ')) throw new Error('Unauthorized')
  const decoded = await getAuth().verifyIdToken(h.replace('Bearer ', ''))
  return decoded.uid
}

export function db() { ensureInit(); return getFirestore() }
export function bucket() { ensureInit(); return getStorage().bucket() }
export { FieldValue }

// CORS helper
const ALLOWED_ORIGINS = ['https://assifolio.com', 'http://localhost:5173']

export function cors(reqOrRes, res) {
  // cors(res) 또는 cors(req, res) 둘 다 지원
  if (!res) { res = reqOrRes; reqOrRes = null }
  const origin = reqOrRes?.headers?.origin || ''
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

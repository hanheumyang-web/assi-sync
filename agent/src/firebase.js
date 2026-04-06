import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { config } from './config.js'

let initialized = false

export function initFirebase() {
  if (initialized) return
  const serviceAccount = JSON.parse(readFileSync(config.serviceAccountPath, 'utf-8'))
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: config.storageBucket,
  })
  initialized = true
}

export function getDb() {
  return admin.firestore()
}

export function getBucket() {
  return admin.storage().bucket()
}

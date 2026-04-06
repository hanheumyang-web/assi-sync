import 'dotenv/config'
import { resolve } from 'path'

export const config = {
  watchDir: process.env.WATCH_DIR,
  uid: process.env.UID,
  serviceAccountPath: resolve(process.env.SERVICE_ACCOUNT_PATH || './serviceAccountKey.json'),
  deleteMode: process.env.DELETE_MODE || 'remove',
  storageBucket: 'assi-app-6ea04.firebasestorage.app',
  projectId: 'assi-app-6ea04',
}

export function validateConfig() {
  if (!config.watchDir) throw new Error('WATCH_DIR 환경변수가 필요합니다')
  if (!config.uid) throw new Error('UID 환경변수가 필요합니다')
}

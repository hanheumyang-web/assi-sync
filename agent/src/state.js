import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STATE_PATH = resolve(__dirname, '..', '.assi-sync-state.json')

let state = { syncedFiles: {} }

export function loadState() {
  if (existsSync(STATE_PATH)) {
    try {
      state = JSON.parse(readFileSync(STATE_PATH, 'utf-8'))
    } catch {
      state = { syncedFiles: {} }
    }
  }
  return state
}

export function saveState() {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
}

export function isFileSynced(relativePath) {
  return !!state.syncedFiles[relativePath]
}

export function markSynced(relativePath, data) {
  state.syncedFiles[relativePath] = {
    ...data,
    syncedAt: new Date().toISOString(),
  }
  saveState()
}

export function removeSynced(relativePath) {
  const entry = state.syncedFiles[relativePath]
  delete state.syncedFiles[relativePath]
  saveState()
  return entry
}

export function getSyncedEntry(relativePath) {
  return state.syncedFiles[relativePath] || null
}

export function getAllSyncedPaths() {
  return Object.keys(state.syncedFiles)
}

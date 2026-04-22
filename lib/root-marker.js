// ═════════════════════════════════════════════════════════════════════════
// Phase 2 W2-int — 루트 폴더 마커
// ─────────────────────────────────────────────────────────────────────────
// 각 동기화 루트 (개인/팀) 에 .assi-root 숨김 파일 저장.
// 유저가 폴더를 수동 이동해도 마커의 rootId 로 새 위치 탐지 가능.
//
// Marker 포맷: { rootId, type: 'personal' | 'workspace', workspaceId?, createdAt }
// ═════════════════════════════════════════════════════════════════════════

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const os = require('node:os')
const { execFile } = require('node:child_process')

const MARKER = '.assi-root'

function markerPath(rootPath) { return path.join(rootPath, MARKER) }

function readMarker(rootPath) {
  try {
    const raw = fs.readFileSync(markerPath(rootPath), 'utf-8')
    return JSON.parse(raw)
  } catch { return null }
}

function writeMarker(rootPath, meta) {
  fs.mkdirSync(rootPath, { recursive: true })
  const existing = readMarker(rootPath)
  // 같은 폴더 덮어쓸 때는 기존 rootId 유지 (idempotent)
  const rootId = existing?.rootId || crypto.randomUUID()
  const data = { ...meta, rootId, createdAt: existing?.createdAt || new Date().toISOString() }
  fs.writeFileSync(markerPath(rootPath), JSON.stringify(data, null, 2))
  // Windows: 숨김 속성 (best-effort, 실패해도 무시)
  if (process.platform === 'win32') {
    try { execFile('attrib', ['+H', markerPath(rootPath)], () => {}) } catch {}
  }
  return data
}

/** 있으면 읽고, 없으면 새로 씀 */
function ensureMarker(rootPath, meta) {
  const existing = readMarker(rootPath)
  if (existing?.rootId) return existing
  return writeMarker(rootPath, meta)
}

/**
 * 공통 위치 스캔해서 주어진 rootId 가진 폴더 찾기.
 * depth=1 (즉 candidate parent 의 직속 자식만) — 성능 보호.
 *
 * 스캔 대상:
 *   - extraParents (호출자 제공, 예: 기존 경로의 parent)
 *   - ~/Desktop, ~/Documents, ~
 *   - Windows: C:\, D:\, E:\, F:\, G:\  (존재하는 것만)
 *   - Mac: /Volumes/*
 */
function scanForRootId(rootId, { extraParents = [] } = {}) {
  const home = os.homedir()
  const candidates = new Set([
    ...extraParents,
    path.join(home, 'Desktop'),
    path.join(home, 'Documents'),
    home,
  ])
  if (process.platform === 'win32') {
    for (const letter of ['C', 'D', 'E', 'F', 'G']) {
      const drive = `${letter}:\\`
      if (fs.existsSync(drive)) candidates.add(drive)
    }
  } else if (process.platform === 'darwin') {
    try {
      for (const v of fs.readdirSync('/Volumes')) {
        candidates.add(path.join('/Volumes', v))
      }
    } catch {}
  }

  for (const parent of candidates) {
    let children
    try { children = fs.readdirSync(parent) } catch { continue }
    for (const child of children) {
      if (child.startsWith('.')) continue
      const childPath = path.join(parent, child)
      try {
        const stat = fs.statSync(childPath)
        if (!stat.isDirectory()) continue
        const m = readMarker(childPath)
        if (m && m.rootId === rootId) return childPath
      } catch {}
    }
  }
  return null
}

module.exports = { writeMarker, readMarker, ensureMarker, scanForRootId, MARKER, markerPath }

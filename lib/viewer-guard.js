// ═════════════════════════════════════════════════════════════════════════
// Phase 2 W2 — Viewer guard: 로컬 수정 격리
// ─────────────────────────────────────────────────────────────────────────
// viewer 역할 멤버가 팀 폴더에서 파일 수정/추가 시 `.local-changes/` 로
// 옮겨서 업로드 루프에 진입하지 못하게 차단. 트레이 알림 1회/세션.
//
// W2 에서는 순수 로직만 제공 — chokidar 이벤트 훅 통합은 sync-engine 통합 단계에서.
// ═════════════════════════════════════════════════════════════════════════

const fs = require('node:fs')
const path = require('node:path')

const LOCAL_CHANGES_DIR = '.local-changes'

/**
 * 파일을 격리 폴더로 이동. 원본 파일은 남겨두고 **복사** (사용자가 계속 볼 수 있게).
 * sync-engine 의 chokidar 이벤트 핸들러에서 호출.
 *
 * @param {object} opts
 * @param {string} opts.filePath — 전체 경로 (예: /Users/yang/ASSI - 팀/FASHION/cover.jpg)
 * @param {string} opts.workspaceRoot — 팀 루트 (예: /Users/yang/ASSI - 팀)
 * @returns {{ isolatedPath: string, relPath: string }}
 */
function isolateLocalChange({ filePath, workspaceRoot }) {
  const relPath = path.relative(workspaceRoot, filePath)
  const isolatedPath = path.join(workspaceRoot, LOCAL_CHANGES_DIR, relPath)
  fs.mkdirSync(path.dirname(isolatedPath), { recursive: true })
  // 원본 유지 + 격리 사본 — viewer 가 자기 수정본 확인 가능
  fs.copyFileSync(filePath, isolatedPath)
  return { isolatedPath, relPath }
}

/**
 * chokidar ignored 옵션에 쓸 경로 매처. `.local-changes/` 하위 + 일반 dotfile 제외.
 */
function shouldIgnorePath(filePath, workspaceRoot) {
  const rel = path.relative(workspaceRoot, filePath)
  return rel.startsWith(LOCAL_CHANGES_DIR + path.sep) || rel === LOCAL_CHANGES_DIR
}

/**
 * 세션당 1회 알림 상태. 트레이/렌더러에 브로드캐스트 후 재알림 방지.
 */
class ViewerIsolationNotifier {
  constructor({ onNotify } = {}) {
    this.onNotify = onNotify || (() => {})
    this.notified = new Set() // wsId:session 단위
    this.counts = new Map()   // wsId → 격리 누적 건수
  }

  record(workspaceId) {
    const n = (this.counts.get(workspaceId) || 0) + 1
    this.counts.set(workspaceId, n)
    if (!this.notified.has(workspaceId)) {
      this.notified.add(workspaceId)
      this.onNotify({ workspaceId, count: n, firstTime: true })
    }
    return n
  }

  getCount(workspaceId) { return this.counts.get(workspaceId) || 0 }
  reset(workspaceId) { this.notified.delete(workspaceId); this.counts.delete(workspaceId) }
}

module.exports = {
  LOCAL_CHANGES_DIR,
  isolateLocalChange,
  shouldIgnorePath,
  ViewerIsolationNotifier,
}

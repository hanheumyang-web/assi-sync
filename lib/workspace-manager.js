// ═════════════════════════════════════════════════════════════════════════
// Phase 2 W2 — Workspace Manager: 다중 폴더 오케스트레이션 (scaffolding)
// ─────────────────────────────────────────────────────────────────────────
// 개인 폴더 (`~/ASSI/`) + 팀 폴더들 (`~/ASSI - {팀명}/`) 을 통합 관리.
//
// W2 범위 (이번 단계):
//   - 워크스페이스 목록 캐싱 + 폴더 경로 계산
//   - 팀 폴더 자동 생성 (mkdir)
//   - state.json 의 workspace 별 bucket 접근 API
//
// W2 다음 단계 (sync-engine 통합):
//   - 워크스페이스마다 chokidar watcher + polling 루프 생성
//   - viewer-guard 를 chokidar 이벤트 핸들러에 훅
//   - bootstrap 결과에 따라 since 주입
// ═════════════════════════════════════════════════════════════════════════

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const PERSONAL_CONTEXT = 'personal'

class WorkspaceManager {
  /**
   * @param {object} opts
   * @param {object} opts.api — ApiClient 인스턴스
   * @param {string} opts.homeDir — 기본 os.homedir()
   * @param {string} opts.personalRoot — 개인 폴더 전체 경로 (예: ~/ASSI 또는 ~/Desktop/ASSI). sync-engine 의 기존 rootFolder 와 동일
   */
  constructor({ api, homeDir, personalRoot }) {
    this.api = api
    this.homeDir = homeDir || os.homedir()
    this.personalRoot = personalRoot
    this.workspaces = []   // [{ id, name, syncFolderName, myRole, ... }]
  }

  /**
   * 서버에서 워크스페이스 목록 fetch → 로컬 캐시 갱신 + 누락된 폴더 자동 생성.
   */
  async refresh() {
    const { workspaces } = await this.api.getMyWorkspaces()
    this.workspaces = workspaces || []
    for (const ws of this.workspaces) {
      const root = this.getWorkspaceRoot(ws)
      if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: true })
      }
    }
    return this.workspaces
  }

  /**
   * 워크스페이스 로컬 폴더 경로. **개인 폴더 옆** 에 생성.
   * 예: 개인이 ~/Desktop/ASSI 면 팀은 ~/Desktop/ASSI - 팀명/.
   * personalRoot 없으면 fallback 으로 homeDir 기준.
   */
  getWorkspaceRoot(wsOrId) {
    if (wsOrId === PERSONAL_CONTEXT || wsOrId == null) return this.personalRoot
    const ws = typeof wsOrId === 'string'
      ? this.workspaces.find(w => w.id === wsOrId)
      : wsOrId
    if (!ws) throw new Error(`Workspace not found: ${wsOrId}`)
    const parent = this.personalRoot ? path.dirname(this.personalRoot) : this.homeDir
    return path.join(parent, `ASSI - ${ws.syncFolderName || ws.name}`)
  }

  /**
   * 임의 파일 경로 → 어느 컨텍스트 소속인가. `personal` 또는 wsId.
   */
  resolveContext(filePath) {
    const abs = path.resolve(filePath)
    if (this.personalRoot && abs.startsWith(path.resolve(this.personalRoot) + path.sep)) {
      return PERSONAL_CONTEXT
    }
    for (const ws of this.workspaces) {
      const root = this.getWorkspaceRoot(ws)
      if (abs.startsWith(path.resolve(root) + path.sep)) return ws.id
    }
    return null
  }

  getRole(wsContext) {
    if (wsContext === PERSONAL_CONTEXT || wsContext == null) return 'owner'  // 개인 = 항상 owner
    const ws = this.workspaces.find(w => w.id === wsContext)
    return ws ? ws.myRole : null
  }

  /**
   * state.json 의 workspace 별 bucket 접근 — sync-engine 이 공유하는 state 객체 주입.
   * state.workspaces[wsId] 에 저장. personal 은 기존 state.syncedFiles 호환 유지.
   */
  getStateBucket(state, wsContext) {
    if (wsContext === PERSONAL_CONTEXT || wsContext == null) {
      // 기존 Phase 1 구조 유지 — state.syncedFiles 직접
      if (!state.syncedFiles) state.syncedFiles = {}
      return {
        get syncedFiles() { return state.syncedFiles },
        set syncedFiles(v) { state.syncedFiles = v },
        get downloadSince() { return state.downloadSince },
        set downloadSince(v) { state.downloadSince = v },
      }
    }
    if (!state.workspaces) state.workspaces = {}
    if (!state.workspaces[wsContext]) {
      state.workspaces[wsContext] = { syncedFiles: {}, downloadSince: null }
    }
    return state.workspaces[wsContext]
  }
}

module.exports = { WorkspaceManager, PERSONAL_CONTEXT }

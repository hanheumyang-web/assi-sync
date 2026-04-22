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
const { ensureMarker, readMarker, scanForRootId } = require('./root-marker')

const PERSONAL_CONTEXT = 'personal'

class WorkspaceManager {
  /**
   * @param {object} opts
   * @param {object} opts.api — ApiClient 인스턴스
   * @param {string} opts.homeDir — 기본 os.homedir()
   * @param {string} opts.personalRoot — 개인 폴더 전체 경로
   * @param {object} opts.state — sync-engine state (mutable). state.workspaces[wsId].{rootId, localPath} 저장용
   * @param {function} opts.saveState — state 변경 후 저장 콜백
   */
  constructor({ api, homeDir, personalRoot, state, saveState }) {
    this.api = api
    this.homeDir = homeDir || os.homedir()
    this.personalRoot = personalRoot
    this.state = state || {}
    this.saveState = saveState || (() => {})
    this.workspaces = []   // [{ id, name, syncFolderName, myRole, ... }]
  }

  // 나중에 sync-engine state 를 공유할 때 사용 (main.js 에서 선 생성 후 attach)
  attachState(state, saveState) {
    this.state = state
    this.saveState = saveState || this.saveState
    // personalRoot 가 이동됐다면 외부에서 갱신 가능
  }
  setPersonalRoot(newRoot) { this.personalRoot = newRoot }

  /**
   * 서버에서 워크스페이스 목록 fetch → 로컬 캐시 갱신 + 폴더 확보.
   * 각 팀마다:
   *   1. state.workspaces[wsId].localPath 있고 그 경로 존재 + 마커 매치 → 그대로 사용
   *   2. state 에 rootId 있지만 localPath 경로 없음 → scanForRootId 로 이동 감지
   *   3. 아무것도 없음 → 기본 경로에 폴더 생성 + 마커 심음 + state 기록
   */
  async refresh() {
    const { workspaces } = await this.api.getMyWorkspaces()
    this.workspaces = workspaces || []
    if (!this.state.workspaces) this.state.workspaces = {}

    for (const ws of this.workspaces) {
      const bucket = this.state.workspaces[ws.id] || (this.state.workspaces[ws.id] = { syncedFiles: {}, downloadSince: null })
      const defaultPath = this._defaultWorkspaceRoot(ws)
      let resolvedPath = null

      // Case 1 — 저장된 localPath 유효
      if (bucket.localPath && fs.existsSync(bucket.localPath)) {
        const m = readMarker(bucket.localPath)
        if (m?.rootId && (!bucket.rootId || m.rootId === bucket.rootId)) {
          bucket.rootId = m.rootId
          resolvedPath = bucket.localPath
        }
      }

      // Case 2 — rootId 있지만 경로 유실 → 이동 탐지
      if (!resolvedPath && bucket.rootId) {
        const extraParents = []
        if (bucket.localPath) extraParents.push(path.dirname(bucket.localPath))
        extraParents.push(path.dirname(defaultPath))
        const found = scanForRootId(bucket.rootId, { extraParents })
        if (found) {
          console.log(`[workspace-manager] ws=${ws.id} moved: ${bucket.localPath} → ${found}`)
          bucket.localPath = found
          resolvedPath = found
        }
      }

      // Case 3 — 없으면 기본 경로에 새로 만들기
      if (!resolvedPath) {
        fs.mkdirSync(defaultPath, { recursive: true })
        const marker = ensureMarker(defaultPath, { type: 'workspace', workspaceId: ws.id })
        bucket.rootId = marker.rootId
        bucket.localPath = defaultPath
        resolvedPath = defaultPath
      } else {
        // 경로 확정 후 마커 없으면 주입 (legacy 폴더 backfill)
        const marker = ensureMarker(resolvedPath, { type: 'workspace', workspaceId: ws.id })
        if (!bucket.rootId) bucket.rootId = marker.rootId
      }
    }
    this.saveState()
    return this.workspaces
  }

  // 기본 기대 경로 — 개인 폴더 옆 (~/Desktop/ASSI 면 ~/Desktop/ASSI - 팀명)
  _defaultWorkspaceRoot(ws) {
    const parent = this.personalRoot ? path.dirname(this.personalRoot) : this.homeDir
    return path.join(parent, `ASSI - ${ws.syncFolderName || ws.name}`)
  }

  /**
   * 워크스페이스 로컬 폴더 경로 — state.workspaces[wsId].localPath 우선, 없으면 기본 경로.
   * (refresh() 한 번이라도 돈 뒤에는 localPath 가 state 에 저장됨)
   */
  getWorkspaceRoot(wsOrId) {
    if (wsOrId === PERSONAL_CONTEXT || wsOrId == null) return this.personalRoot
    const ws = typeof wsOrId === 'string'
      ? this.workspaces.find(w => w.id === wsOrId)
      : wsOrId
    if (!ws) throw new Error(`Workspace not found: ${wsOrId}`)
    const stored = this.state?.workspaces?.[ws.id]?.localPath
    if (stored && fs.existsSync(stored)) return stored
    return this._defaultWorkspaceRoot(ws)
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

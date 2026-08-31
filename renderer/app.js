// Firebase client SDK (loaded via CDN in a real app, but here we use the preload bridge)
// Auth is handled via Google OAuth popup

let currentUser = null
let selectedFolder = null
const fileStatuses = new Map() // path → status data

// [v1.9.15] main process 로그 forward — DevTools Console 에 [main] 표시
if (window.api?.onMainLog) {
  window.api.onMainLog(({ lvl, msg }) => {
    const style = lvl === 'error' ? 'color:#EF4444;font-weight:bold' : lvl === 'warn' ? 'color:#F59E0B' : 'color:#828DF8'
    console.log(`%c[main] %c${msg}`, style, '')
  })
}

// ── Screen Navigation ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  document.getElementById(id).classList.add('active')
}

// ── OAuth Login (Google + Apple) ──
async function handleOAuthLogin(providerKind) {
  const btnId = providerKind === 'apple' ? 'btn-apple-login' : 'btn-google-login'
  const btn = document.getElementById(btnId)
  const originalHTML = btn.innerHTML
  btn.disabled = true
  btn.innerHTML = '<span style="font-size:13px">로그인 중...</span>'
  try {
    const apiCall = providerKind === 'apple' ? window.api.appleLogin : window.api.googleLogin
    const result = await apiCall()
    if (result.error) {
      alert('로그인 실패: ' + result.error)
      btn.disabled = false
      btn.innerHTML = originalHTML
      return
    }
    currentUser = { uid: result.uid, name: result.name || '', email: result.email || '' }
    selectedFolder = (await window.api.getConfig()).watchDir || null
    showSetup()
  } catch (err) {
    alert('로그인 실패: ' + err.message)
    btn.disabled = false
    btn.innerHTML = originalHTML
  }
}

document.getElementById('btn-google-login').addEventListener('click', () => handleOAuthLogin('google'))
document.getElementById('btn-apple-login').addEventListener('click', () => handleOAuthLogin('apple'))

// ── UID Login (fallback) ──
document.getElementById('btn-login').addEventListener('click', async () => {
  try {
    const config = await window.api.getConfig()
    if (config.uid) {
      currentUser = { uid: config.uid, name: config.name || '', email: config.email || '' }
      selectedFolder = config.watchDir || null
      showSetup()
      return
    }

    const uid = document.getElementById('uid-input').value.trim()
    if (!uid) { document.getElementById('uid-input').focus(); return }

    currentUser = { uid, name: '', email: '' }
    await window.api.saveConfig({ uid })
    showSetup()
  } catch (err) {
    alert('로그인 실패: ' + err.message)
  }
})

function showSetup() {
  document.getElementById('welcome-name').textContent = currentUser.name || '환영합니다'
  document.getElementById('welcome-email').textContent = currentUser.email || `UID: ${currentUser.uid}`
  if (selectedFolder) updateFolderDisplay(selectedFolder)
  showScreen('setup-screen')
}

// ── Folder Selection ──
document.getElementById('btn-folder').addEventListener('click', async () => {
  const folder = await window.api.selectFolder()
  if (folder) {
    selectedFolder = folder
    updateFolderDisplay(folder)
  }
})

function updateFolderDisplay(folder) {
  const el = document.getElementById('folder-display')
  el.textContent = folder
  el.classList.remove('empty')
  document.getElementById('btn-start').disabled = false
}

// ── Start Sync ──
document.getElementById('btn-start').addEventListener('click', async () => {
  if (!currentUser || !selectedFolder) return
  showScreen('sync-screen')
  updateSyncUserLabel()
  fileStatuses.clear()
  renderFileList()
  await window.api.startSync({ uid: currentUser.uid, watchDir: selectedFolder })
    setTimeout(peekTrashOnce, 4000)
})

function updateSyncUserLabel() {
  const el = document.getElementById('sync-user-label')
  if (el && currentUser) {
    el.textContent = currentUser.name || currentUser.email || currentUser.uid
  }
}

// ── Stop Sync ──
document.getElementById('btn-stop').addEventListener('click', async () => {
  await window.api.stopSync()
  showSetup()
})

// ── Change Folder ──
document.getElementById('btn-change-folder').addEventListener('click', async () => {
  const folder = await window.api.selectFolder()
  if (folder) {
    await window.api.stopSync()
    selectedFolder = folder
    await window.api.saveConfig({ watchDir: folder })
    showScreen('sync-screen')
    fileStatuses.clear()
    renderFileList()
    await window.api.startSync({ uid: currentUser.uid, watchDir: folder })
    setTimeout(peekTrashOnce, 4000)
  }
})

/* 어느 운영체제인지 화면에 표시해 둔다 — 맥이면 가짜 창 버튼을 감춘다.
   맥에서는 시스템이 진짜 창 버튼을 왼쪽 위에 그린다. */
document.body.dataset.os = (window.api && window.api.platform) || 'unknown'

// ── Open Web ──
document.getElementById('btn-open-web').addEventListener('click', () => {
  window.api.openExternal('https://pofol.co')
})

// ── Logout ──
document.getElementById('btn-logout').addEventListener('click', async () => {
  await window.api.stopSync()
  // 계정 바꿀 때 다른 사람 파일 충돌 막으려고 sync state 도 청소 — 다음 로그인 시 fresh sync.
  try { await window.api.clearSyncState() } catch {}
  await window.api.saveConfig({ uid: '', watchDir: '', name: '', email: '', idToken: '', refreshToken: '' })
  currentUser = null
  selectedFolder = null
  document.getElementById('uid-input').value = ''
  showScreen('login-screen')
})

// ── Retry ──
document.getElementById('btn-retry-all').addEventListener('click', () => {
  window.api.retryAllFailed()
})

// ── Rescan (새로고침) + 공유 체크 ──
document.getElementById('btn-rescan').addEventListener('click', async () => {
  const btn = document.getElementById('btn-rescan')
  btn.disabled = true
  btn.textContent = '⏳'
  try {
    await window.api.rescan()
    // rescan 후 공유 대기 건도 확인
    const shareResult = await window.api.checkShares()
    if (shareResult?.error) {
      console.error('[Share]', shareResult.error)
    }
  } catch {}
  btn.disabled = false
  btn.textContent = '🔄'
})

// ── Event Handlers ──
window.api.onSyncProgress((data) => {
  const statusEl = document.getElementById('sync-status')
  const infoEl = document.getElementById('sync-info')

  if (data.phase === 'scanning') {
    statusEl.innerHTML = '<span class="dot syncing"></span>스캔 중...'
    infoEl.textContent = `${data.total}개 파일 발견`
  } else if (data.phase === 'syncing') {
    statusEl.innerHTML = '<span class="dot syncing"></span>동기화 중...'
    infoEl.textContent = `${data.completed} / ${data.total}`
  } else if (data.phase === 'watching') {
    statusEl.innerHTML = '<span class="dot watching"></span>동기화 중'
    infoEl.textContent = `${data.total}개 파일 동기화 완료`
    refreshSyncedFolders()
  } else if (data.phase === 'share_uploading') {
    statusEl.innerHTML = '<span class="dot syncing"></span>무압축 공유 업로드 중'
    infoEl.textContent = `${data.projectName || '공유'} · ${data.completed} / ${data.total}`
  } else if (data.phase === 'share_complete') {
    statusEl.innerHTML = '<span class="dot watching"></span>동기화 중'
    infoEl.textContent = `공유 업로드 완료 (${data.total}개)`
    setTimeout(() => {
      infoEl.textContent = `${Object.keys(window._lastSyncTotal || {}).length || data.total}개 파일 동기화 완료`
    }, 3000)
  } else if (data.phase === 'share_error') {
    statusEl.innerHTML = '<span class="dot watching"></span>동기화 중'
    infoEl.textContent = `공유 오류: ${data.message || '알 수 없음'}`
  }
})

window.api.onFileStatus((data) => {
  fileStatuses.set(data.path, data)
  updateFileItem(data)
  updateSummary()
})

window.api.onSyncError((data) => {
  console.error('Sync error:', data)
})

// ── New Folder Auto-Sync Notification ──
window.api.onNewFolder((data) => {
  // 자동 승인 — 간단한 알림만 표시
  const container = document.getElementById('folder-toasts')
  const toast = document.createElement('div')
  toast.className = 'folder-toast'
  toast.style.cssText = 'padding:12px 20px;width:340px'

  const fileText = data.fileCount > 0 ? `${data.fileCount}개 파일` : ''
  toast.innerHTML = `
    <div class="toast-title">📁 ${data.name} ${fileText ? '· ' + fileText : ''}</div>
    <div class="toast-desc" style="color:#4ADE80;font-weight:600">자동 동기화 시작</div>
  `
  container.appendChild(toast)
  setTimeout(() => toast.remove(), 3000)
})

// ── Pending Folders ──
async function refreshPendingFolders() {
  const folders = await window.api.getPendingFolders()
  renderPendingFolders(folders)
}

function renderPendingFolders(folders) {
  const section = document.getElementById('pending-section')
  const list = document.getElementById('pending-list')

  if (!folders || folders.length === 0) {
    section.style.display = 'none'
    return
  }

  section.style.display = 'block'
  list.innerHTML = (folders.length > 1 ? `
    <div class="pending-item" style="border-bottom:1px solid rgba(0,0,0,0.04)">
      <div class="pending-icon">📦</div>
      <div class="pending-info">
        <div class="pending-name">전체 ${folders.length}개 폴더</div>
        <div class="pending-meta">한번에 모두 업로드</div>
      </div>
      <div class="pending-actions">
        <button class="btn-pending upload" onclick="approveAllPendingFolders()">전체 업로드</button>
      </div>
    </div>
  ` : '') + folders.map(f => `
    <div class="pending-item" id="pending-${f.key.replace(/[^a-zA-Z0-9]/g, '_')}">
      <div class="pending-icon">📁</div>
      <div class="pending-info">
        <div class="pending-name">${f.name}</div>
        <div class="pending-meta">${f.fileCount}개 파일 · 대기 중</div>
      </div>
      <div class="pending-actions">
        <button class="btn-pending remove" onclick="removePendingFolder('${f.key}')">삭제</button>
        <button class="btn-pending upload" onclick="approvePendingFolder('${f.key}')">업로드</button>
      </div>
    </div>
  `).join('')
}

async function approvePendingFolder(key) {
  // 버튼 비활성화
  const el = document.getElementById('pending-' + key.replace(/[^a-zA-Z0-9]/g, '_'))
  if (el) {
    const btn = el.querySelector('.btn-pending.upload')
    if (btn) { btn.textContent = '업로드 중...'; btn.disabled = true }
  }
  await window.api.approvePendingFolder(key)
}
window.approvePendingFolder = approvePendingFolder

async function removePendingFolder(key) {
  await window.api.removePendingFolder(key)
}
window.removePendingFolder = removePendingFolder

async function approveAllPendingFolders() {
  const folders = await window.api.getPendingFolders()
  for (const f of folders) {
    await window.api.approvePendingFolder(f.key)
  }
}
window.approveAllPendingFolders = approveAllPendingFolders

// 대기 목록 업데이트 이벤트
window.api.onPendingFoldersUpdated((folders) => {
  renderPendingFolders(folders)
})

// ── Synced Folders ──
async function refreshSyncedFolders() {
  const folders = await window.api.getSyncedFolders()
  renderSyncedFolders(folders)
}

function renderSyncedFolders(folders) {
  const section = document.getElementById('synced-section')
  const list = document.getElementById('synced-list')

  if (!folders || folders.length === 0) {
    section.style.display = 'none'
    return
  }

  section.style.display = 'block'
  // 전체선택 체크박스 리셋
  const cbAll = document.getElementById('cb-select-all')
  if (cbAll) cbAll.checked = false
  updateBatchButtons()

  list.innerHTML = folders.map(f => `
    <div class="pending-item" id="synced-${f.key.replace(/[^a-zA-Z0-9]/g, '_')}" data-folder-key="${f.key}">
      <input type="checkbox" class="item-cb" data-key="${f.key}" onchange="onItemCheckChange()">
      <div class="pending-icon">📁</div>
      <div class="pending-info">
        <div class="pending-name">${f.name}</div>
        <div class="pending-meta">${f.fileCount}개 파일 · <span class="synced-badge">업로드 됨</span></div>
      </div>
      <div class="pending-actions">
        <button class="btn-pending resync" onclick="resyncFolder('${f.key}')">재업로드</button>
        <button class="btn-pending remove" onclick="deleteSyncedFolder('${f.key}')">삭제</button>
      </div>
    </div>
  `).join('')
}

// ── 체크박스 전체선택/해제 ──
function toggleSelectAll(cb) {
  const checkboxes = document.querySelectorAll('#synced-list .item-cb')
  checkboxes.forEach(c => c.checked = cb.checked)
  updateBatchButtons()
}
window.toggleSelectAll = toggleSelectAll

function onItemCheckChange() {
  const all = document.querySelectorAll('#synced-list .item-cb')
  const checked = document.querySelectorAll('#synced-list .item-cb:checked')
  const cbAll = document.getElementById('cb-select-all')
  const label = document.getElementById('select-all-label')
  if (cbAll) cbAll.checked = all.length > 0 && checked.length === all.length
  if (label) label.textContent = checked.length > 0 ? `${checked.length}개 선택됨` : '전체선택'
  updateBatchButtons()
}
window.onItemCheckChange = onItemCheckChange

function updateBatchButtons() {
  const checked = document.querySelectorAll('#synced-list .item-cb:checked')
  const hasSelection = checked.length > 0
  const btnResync = document.getElementById('btn-batch-resync')
  const btnRemove = document.getElementById('btn-batch-remove')
  if (btnResync) btnResync.style.display = hasSelection ? 'block' : 'none'
  if (btnRemove) btnRemove.style.display = hasSelection ? 'block' : 'none'
}

function getSelectedKeys() {
  return Array.from(document.querySelectorAll('#synced-list .item-cb:checked'))
    .map(cb => cb.dataset.key)
    .filter(Boolean)
}

// ── 일괄 재업로드 ──
async function batchResync() {
  const keys = getSelectedKeys()
  if (!keys.length) return
  if (!confirm(`${keys.length}개 폴더를 재업로드하시겠습니까?`)) return
  for (const key of keys) {
    const el = document.getElementById('synced-' + key.replace(/[^a-zA-Z0-9]/g, '_'))
    if (el) {
      const btn = el.querySelector('.btn-pending.resync')
      if (btn) { btn.textContent = '대기 중...'; btn.disabled = true }
    }
  }
  for (const key of keys) {
    await window.api.resyncFolder(key)
  }
}
window.batchResync = batchResync

// ── 일괄 삭제 ──
async function batchDelete() {
  const keys = getSelectedKeys()
  if (!keys.length) return
  if (!confirm(`${keys.length}개 폴더를 삭제하시겠습니까? 서버 데이터도 함께 삭제됩니다.`)) return
  for (const key of keys) {
    const el = document.getElementById('synced-' + key.replace(/[^a-zA-Z0-9]/g, '_'))
    if (el) {
      const btn = el.querySelector('.btn-pending.remove')
      if (btn) { btn.textContent = '삭제 중...'; btn.disabled = true }
    }
  }
  for (const key of keys) {
    await window.api.deleteSyncedFolder(key)
  }
}
window.batchDelete = batchDelete

// ── 개별 재업로드/삭제 (기존) ──
async function resyncFolder(key) {
  const el = document.getElementById('synced-' + key.replace(/[^a-zA-Z0-9]/g, '_'))
  if (el) {
    const btn = el.querySelector('.btn-pending.resync')
    if (btn) { btn.textContent = '업로드 중...'; btn.disabled = true }
  }
  await window.api.resyncFolder(key)
}
window.resyncFolder = resyncFolder

async function deleteSyncedFolder(key) {
  if (!confirm('이 폴더의 업로드 기록과 서버 데이터를 삭제하시겠습니까?')) return
  const el = document.getElementById('synced-' + key.replace(/[^a-zA-Z0-9]/g, '_'))
  if (el) {
    const btn = el.querySelector('.btn-pending.remove')
    if (btn) { btn.textContent = '삭제 중...'; btn.disabled = true }
  }
  await window.api.deleteSyncedFolder(key)
}
window.deleteSyncedFolder = deleteSyncedFolder

window.api.onSyncedFoldersUpdated((folders) => {
  renderSyncedFolders(folders)
})

// ── Finder 폴더 삭제 confirm 다이얼로그 ──
// chokidar 가 unlinkDir 감지하면 main 이 'folder-deletion-requested' 이벤트 보냄.
// 사용자에게 "웹에서도 삭제할래?" 확인 받음. 자동 삭제 안 함.
window.api.onFolderDeletionRequested(async (info) => {
  const { folderName, projectId, fileCount } = info
  if (!projectId) {
    console.warn('[folder-deletion] projectId 없음, 다이얼로그 스킵')
    return
  }
  const msg = `동기화된 폴더 "${folderName}" 가 삭제되었습니다.\n` +
              `웹에서도 삭제할까요? (${fileCount}개 파일)\n\n` +
              `※ 삭제해도 휴지통에 30일간 보관됩니다.\n` +
              `※ 취소하면 다음 동기화 때 자동으로 다시 받아집니다.`
  const ok = window.confirm(msg)
  if (ok) {
    const r = await window.api.confirmFolderDeletion({ projectId })
    if (r?.ok) {
      console.log(`[folder-deletion] soft-deleted ${folderName} (assets: ${r.markedAssets})`)
    } else {
      alert(`삭제 실패: ${r?.error || '알 수 없는 오류'}`)
    }
  } else {
    await window.api.cancelFolderDeletion()
    console.log(`[folder-deletion] 취소됨 — 다음 폴링에서 ${folderName} 자동 복구`)
  }
})

// ── Explorer Mode ──
let dragNode = null

// 탭 세 개 — 활동 / 탐색기 / 휴지통
// ⚠️ 예전에는 둘뿐이라 'isExp' 참·거짓으로 갈랐는데, 셋이 되면서 그 방식으로는 안 된다.
const TABS = ['activity', 'explorer', 'trash']
TABS.forEach(t => document.getElementById('tab-' + t).addEventListener('click', () => switchTab(t)))

function switchTab(tab) {
  TABS.forEach(t => {
    const on = t === tab
    const btn = document.getElementById('tab-' + t)
    btn.style.background = on ? '#111' : '#fff'
    btn.style.color = on ? '#fff' : '#666'
    btn.style.border = on ? 'none' : '1px solid rgba(0,0,0,0.08)'
  })
  document.getElementById('explorer-pane').style.display = tab === 'explorer' ? 'block' : 'none'
  document.getElementById('trash-pane').style.display = tab === 'trash' ? 'block' : 'none'
  document.getElementById('activity-pane').style.display = tab === 'activity' ? 'flex' : 'none'
  document.getElementById('activity-pane').style.flexDirection = 'column'
  if (tab === 'explorer') refreshExplorer()
  if (tab === 'trash') loadTrash()
}

let explorerRoot = ''

async function refreshExplorer() {
  const pane = document.getElementById('explorer-pane')
  pane.innerHTML = '<div style="text-align:center;padding:40px;color:#999;font-size:11px">스캔 중...</div>'
  const data = await window.api.scanFolderTree()
  if (!data) { pane.innerHTML = '<div style="padding:20px;color:#999;font-size:11px">동기화 폴더가 없습니다</div>'; return }
  explorerRoot = data.root
  expandedProjects.clear()
  const currentSize = parseInt(document.documentElement.style.getPropertyValue('--thumb-size')) || 60
  const toolbarHtml = `
    <div class="explorer-toolbar">
      <span>🔍</span>
      <input type="range" min="30" max="200" value="${currentSize}" oninput="setThumbSize(this.value)">
      <span class="thumb-size-label">${currentSize}px</span>
    </div>
  `
  pane.innerHTML = toolbarHtml + renderTree(data.tree, data.root)
  attachExplorerHandlers(data.root)
}

function badgeHtml(b) {
  const map = {
    'category': '<span style="font-size:9px;color:#3B82F6;font-weight:700">✅ 분류</span>',
    'category-custom': '<span style="font-size:9px;color:#8B5CF6;font-weight:700">✨ 커스텀</span>',
    'misplaced': '<span style="font-size:9px;color:#F59E0B;font-weight:700">⚠️ 위치 오류</span>',
    'uploaded': '<span style="font-size:9px;color:#10B981;font-weight:700">🟢 업로드됨</span>',
    'pending': '<span style="font-size:9px;color:#9CA3AF;font-weight:700">⏳ 대기</span>',
    'empty': '<span style="font-size:9px;color:#D1D5DB;font-weight:700">— 비어있음</span>',
  }
  return map[b] || ''
}

function renderTree(nodes, root) {
  if (!nodes.length) return '<div style="padding:20px;color:#999;font-size:11px">폴더가 없습니다</div>'
  return `<div style="font-size:12px">${nodes.map(n => renderNode(n, root)).join('')}</div>`
}

function getProjectKey(fullPath, root) {
  // fullPath에서 root 기준 상대 경로 추출
  let rel = fullPath.replace(/\\/g, '/')
  const r = root.replace(/\\/g, '/')
  if (rel.startsWith(r)) rel = rel.slice(r.length)
  if (rel.startsWith('/')) rel = rel.slice(1)
  return rel
}

function renderNode(n, root) {
  const isCat = n.depth === 0
  const isProject = n.depth === 1
  const indent = n.depth * 16
  const icon = isCat ? '📂' : '📁'
  const childHtml = n.children?.length
    ? n.children.map(c => renderNode(c, root)).join('')
    : (isCat ? '<div style="padding:4px 0 4px 32px;color:#D1D5DB;font-size:10px">— 비어 있음 —</div>' : '')
  const projectKey = isProject ? getProjectKey(n.path, root) : ''
  return `
    <div class="tree-node" data-path="${n.path.replace(/"/g, '&quot;')}" data-depth="${n.depth}" data-project-key="${projectKey}" draggable="${!isCat}"
         style="padding:6px 8px;margin-left:${indent}px;border-radius:8px;display:flex;align-items:center;gap:8px;cursor:${isCat ? 'default' : 'pointer'};border:1px solid transparent">
      <span>${icon}</span>
      <span class="node-name" style="font-weight:${isCat ? '700' : '600'};color:${isCat ? '#111' : '#444'};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${n.name}</span>
      ${badgeHtml(n.badge)}
      <span style="font-size:9px;color:#bbb">${n.fileCount || 0}</span>
      ${isProject ? '<div class="node-actions"><button class="btn-rename" title="이름 변경">✏️</button></div>' : ''}
    </div>
    ${isProject ? `<div class="tree-files" id="files-${projectKey.replace(/[^a-zA-Z0-9]/g, '_')}" style="display:none"></div>` : ''}
    ${childHtml}
  `
}

let expandedProjects = new Set()
let fileDragData = null

function attachExplorerHandlers(root) {
  document.querySelectorAll('.tree-node').forEach(el => {
    const depth = parseInt(el.dataset.depth)
    const fullPath = el.dataset.path
    const projectKey = el.dataset.projectKey

    // 카테고리 간 프로젝트 이동 (기존)
    if (depth > 0) {
      el.addEventListener('dragstart', (e) => {
        if (fileDragData) { e.preventDefault(); return } // 파일 드래그 중이면 무시
        dragNode = fullPath; el.style.opacity = '0.4'
      })
      el.addEventListener('dragend', () => { el.style.opacity = '1'; dragNode = null })
    }

    if (depth === 0) {
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.style.border = '1px solid #F4A259'; el.style.background = '#FFF7ED' })
      el.addEventListener('dragleave', () => { el.style.border = '1px solid transparent'; el.style.background = '' })
      el.addEventListener('drop', async (e) => {
        e.preventDefault()
        el.style.border = '1px solid transparent'; el.style.background = ''
        if (!dragNode) return
        const name = dragNode.split(/[/\\]/).pop()
        const target = fullPath + (fullPath.endsWith('\\') ? '' : '\\') + name
        const result = await window.api.moveFolder(dragNode, target)
        if (result.ok) {
          setTimeout(refreshExplorer, 500)
        } else {
          alert('이동 실패: ' + result.error)
        }
      })
    }

    // 프로젝트 클릭 → 파일 목록 펼치기/접기
    if (depth === 1 && projectKey) {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.btn-rename') || e.target.closest('.rename-input')) return
        toggleProjectFiles(projectKey, root)
      })

      // 이름 변경 버튼
      const renameBtn = el.querySelector('.btn-rename')
      if (renameBtn) {
        renameBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          startRenameProject(el, projectKey)
        })
      }
    }

    // 더블클릭 → 파일 탐색기에서 열기
    el.addEventListener('dblclick', (e) => {
      if (e.target.closest('.btn-rename') || e.target.closest('.rename-input')) return
      window.api.openInExplorer(fullPath)
    })
  })
}

async function toggleProjectFiles(projectKey, root) {
  const safeId = 'files-' + projectKey.replace(/[^a-zA-Z0-9]/g, '_')
  const container = document.getElementById(safeId)
  if (!container) return

  if (expandedProjects.has(projectKey)) {
    expandedProjects.delete(projectKey)
    container.style.display = 'none'
    container.innerHTML = ''
    return
  }

  expandedProjects.add(projectKey)
  container.style.display = 'block'
  container.innerHTML = '<div style="padding:8px;color:#999;font-size:10px">불러오는 중...</div>'

  const files = await window.api.getProjectFiles(projectKey)
  if (files.length === 0) {
    container.innerHTML = '<div style="padding:8px;color:#ccc;font-size:10px">파일 없음</div>'
    return
  }

  container.innerHTML = files.map((f, i) => {
    const thumbSrc = f.isVideo
      ? (f.videoThumbnailUrl || '')
      : (f.url || '')
    const thumbHtml = thumbSrc
      ? `<img class="file-thumb" src="${thumbSrc}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="file-thumb" style="display:flex;align-items:center;justify-content:center;font-size:12px">${f.isVideo ? '🎬' : '📷'}</div>`
    const badges = []
    if (f.isThumbnail) badges.push('<span class="badge-thumb">대표</span>')
    if (f.isVideo) badges.push('<span class="badge-video">영상</span>')
    return `
      <div class="tree-file" draggable="true" data-asset-id="${f.assetId}" data-rel-path="${f.relPath.replace(/"/g, '&quot;')}" data-index="${i}">
        <span class="file-grip">⋮⋮</span>
        ${thumbHtml}
        <span class="file-name">${f.fileName}</span>
        ${badges.join('')}
        <span class="file-order">#${i + 1}</span>
        <button class="btn-rename" title="이름 변경">✏️</button>
      </div>
    `
  }).join('')

  attachFileHandlers(container, projectKey)
}

function attachFileHandlers(container, projectKey) {
  const fileEls = container.querySelectorAll('.tree-file')

  fileEls.forEach(el => {
    // 파일 이름 변경
    el.querySelector('.btn-rename').addEventListener('click', (e) => {
      e.stopPropagation()
      startRenameFile(el)
    })

    // 드래그 순서 변경
    el.addEventListener('dragstart', (e) => {
      e.stopPropagation()
      fileDragData = { el, assetId: el.dataset.assetId, index: parseInt(el.dataset.index) }
      el.classList.add('dragging')
    })
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging')
      fileDragData = null
      container.querySelectorAll('.tree-file').forEach(f => f.classList.remove('drag-over'))
    })
    el.addEventListener('dragover', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (!fileDragData) return
      container.querySelectorAll('.tree-file').forEach(f => f.classList.remove('drag-over'))
      el.classList.add('drag-over')
    })
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'))
    el.addEventListener('drop', async (e) => {
      e.preventDefault()
      e.stopPropagation()
      el.classList.remove('drag-over')
      if (!fileDragData || fileDragData.assetId === el.dataset.assetId) return

      // 순서 재배치
      const allFiles = [...container.querySelectorAll('.tree-file')]
      const fromIdx = allFiles.indexOf(fileDragData.el)
      const toIdx = allFiles.indexOf(el)
      if (fromIdx < 0 || toIdx < 0) return

      // DOM 이동
      if (fromIdx < toIdx) {
        el.after(fileDragData.el)
      } else {
        el.before(fileDragData.el)
      }

      // 순서 번호 업데이트 + Firestore 저장
      const reordered = [...container.querySelectorAll('.tree-file')]
      const orderedIds = reordered.map((f, i) => {
        f.querySelector('.file-order').textContent = `#${i + 1}`
        f.dataset.index = i
        return f.dataset.assetId
      })

      await window.api.reorderFiles(orderedIds)
    })
  })
}

function startRenameProject(nodeEl, projectKey) {
  const nameSpan = nodeEl.querySelector('.node-name')
  const oldName = nameSpan.textContent
  const input = document.createElement('input')
  input.type = 'text'
  input.value = oldName
  input.className = 'rename-input'
  nameSpan.replaceWith(input)
  input.focus()
  input.select()

  const finish = async (save) => {
    const newName = input.value.trim()
    if (save && newName && newName !== oldName) {
      const result = await window.api.renameProject(projectKey, newName)
      if (!result.ok) {
        alert('이름 변경 실패: ' + result.error)
      }
    }
    setTimeout(refreshExplorer, 300)
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true) }
    if (e.key === 'Escape') finish(false)
  })
  input.addEventListener('blur', () => finish(true))
}

function startRenameFile(fileEl) {
  const nameSpan = fileEl.querySelector('.file-name')
  const relPath = fileEl.dataset.relPath
  const oldName = nameSpan.textContent
  const input = document.createElement('input')
  input.type = 'text'
  input.value = oldName
  input.className = 'rename-input'
  nameSpan.replaceWith(input)
  input.focus()

  // 확장자 앞까지만 선택
  const dotIdx = oldName.lastIndexOf('.')
  if (dotIdx > 0) input.setSelectionRange(0, dotIdx)
  else input.select()

  const finish = async (save) => {
    const newName = input.value.trim()
    if (save && newName && newName !== oldName) {
      const result = await window.api.renameFile(relPath, newName)
      if (!result.ok) {
        alert('이름 변경 실패: ' + result.error)
      }
    }
    // 파일 목록 새로고침
    const projectKey = relPath.split('/').slice(0, -1).join('/')
    expandedProjects.delete(projectKey)
    toggleProjectFiles(projectKey)
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true) }
    if (e.key === 'Escape') finish(false)
  })
  input.addEventListener('blur', () => finish(true))
}

// ── Explorer View Size ──
function setThumbSize(val) {
  val = parseInt(val)
  document.documentElement.style.setProperty('--thumb-size', val + 'px')
  // 전체 탐색기 폰트/패딩도 비례 조절
  const scale = val / 60 // 60px 기준
  const fontSize = Math.max(10, Math.min(16, Math.round(12 * scale)))
  const nodePad = Math.max(4, Math.round(6 * scale))
  document.documentElement.style.setProperty('--explorer-font', fontSize + 'px')
  document.documentElement.style.setProperty('--explorer-pad', nodePad + 'px')
  document.querySelectorAll('.thumb-size-label').forEach(el => el.textContent = val + 'px')
}
window.setThumbSize = setThumbSize

// ── File List Rendering ──
function renderFileList() {
  const list = document.getElementById('file-list')
  list.innerHTML = ''
}

function updateFileItem(data) {
  const list = document.getElementById('file-list')

  // Remove empty state
  const empty = list.querySelector('.empty-state')
  if (empty) empty.remove()

  const safeId = 'file-' + data.path.replace(/[^a-zA-Z0-9]/g, '_')
  let item = document.getElementById(safeId)
  if (!item) {
    item = document.createElement('div')
    item.className = 'file-item'
    item.id = safeId
    list.prepend(item)
  }

  const iconClass = data.isVideo ? 'video' : 'image'
  const iconEmoji = data.isVideo ? '🎬' : '📷'

  let statusHtml = ''
  let progressHtml = ''

  if (data.status === 'uploading') {
    statusHtml = `<span class="file-status uploading">${data.progress}%</span>`
    progressHtml = `<div class="file-progress"><div class="file-progress-bar" style="width:${data.progress}%"></div></div>`
  } else if (data.status === 'encoding') {
    statusHtml = `<span class="file-status" style="color:#A78BFA">인코딩</span>`
    progressHtml = `<div class="file-progress"><div class="file-progress-bar" style="width:${data.progress}%;background:#A78BFA"></div></div>`
  } else if (data.status === 'done') {
    statusHtml = '<span class="file-status done">✓</span>'
  } else if (data.status === 'failed') {
    statusHtml = `<button class="btn-retry" onclick="retryFile('${data.path}')">재시도</button>`
  } else if (data.status === 'renamed') {
    statusHtml = '<span class="file-status" style="color:#828DF8">이름 변경</span>'
  } else if (data.status === 'deleted') {
    statusHtml = '<span class="file-status" style="color:#999">삭제됨</span>'
  }

  item.innerHTML = `
    <div class="file-icon ${iconClass}">${iconEmoji}</div>
    <div class="file-info">
      <div class="file-name">${data.fileName}</div>
      <div class="file-meta">${data.size || ''} ${data.phase ? '— ' + data.phase : ''} ${data.error ? '— ' + data.error : ''}</div>
      ${progressHtml}
    </div>
    ${statusHtml}
  `

}

function retryFile(path) {
  window.api.retryFile(path)
}
window.retryFile = retryFile

function updateSummary() {
  const bar = document.getElementById('summary-bar')
  const text = document.getElementById('summary-text')
  const retryBtn = document.getElementById('btn-retry-all')

  let done = 0, failed = 0, uploading = 0, encoding = 0
  for (const [, data] of fileStatuses) {
    if (data.status === 'done') done++
    else if (data.status === 'failed') failed++
    else if (data.status === 'uploading') uploading++
    else if (data.status === 'encoding') encoding++
  }

  const total = done + failed + uploading + encoding
  if (total === 0) { bar.style.display = 'none'; return }

  bar.style.display = 'flex'
  let parts = [`<strong>${done}</strong> 완료`]
  if (encoding > 0) parts.push(`<span style="color:#A78BFA">${encoding} 인코딩 중</span>`)
  if (uploading > 0) parts.push(`${uploading} 업로드 중`)
  if (failed > 0) parts.push(`<span style="color:#EF4444">${failed} 실패</span>`)
  text.innerHTML = parts.join(' · ')

  retryBtn.style.display = failed > 0 ? 'block' : 'none'
}

// ── Tray Menu Actions ──
window.api.onTrayAction((action) => {
  if (action === 'change-folder') {
    document.getElementById('btn-change-folder')?.click()
  } else if (action === 'logout') {
    document.getElementById('btn-logout')?.click()
  } else if (action === 'settings') {
    openSettings()
  }
})

// ── Auto Update UI ──
let updateReady = false
window.api.onUpdateStatus((data) => {
  const banner = document.getElementById('update-banner')
  if (!banner) return

  // ready 상태면 installing/error 외에는 덮어쓰지 않음
  if (updateReady && data.status !== 'ready' && data.status !== 'installing' && data.status !== 'error') return

  if (data.status === 'available') {
    banner.style.display = 'block'
    banner.innerHTML = `
      <div class="update-banner">
        <span class="update-icon">⬇️</span>
        <div class="update-text">
          <strong>v${data.version}</strong> 업데이트 다운로드 중...
          <div class="update-progress"><div class="update-progress-bar" style="width:0%"></div></div>
        </div>
      </div>
    `
  } else if (data.status === 'downloading') {
    banner.style.display = 'block'
    const bar = banner.querySelector('.update-progress-bar')
    const text = banner.querySelector('.update-text')
    if (bar) bar.style.width = `${data.percent}%`
    if (text && !text.querySelector('.update-progress')) {
      // already showing, just update percentage text
    }
  } else if (data.status === 'ready') {
    updateReady = true
    banner.style.display = 'block'
    // releaseNotes: markdown/html → 텍스트 줄로 변환
    let notesHtml = ''
    if (data.releaseNotes) {
      const raw = typeof data.releaseNotes === 'string' ? data.releaseNotes : ''
      const lines = raw.replace(/<[^>]*>/g, '').split(/\n/).map(l => l.trim()).filter(Boolean).slice(0, 5)
      if (lines.length > 0) {
        notesHtml = `<div style="font-size:10px;color:#777;line-height:1.6;padding:8px 12px;background:rgba(0,0,0,0.03);border-radius:8px">${lines.map(l => l.startsWith('•') || l.startsWith('-') || l.startsWith('*') ? l : '• ' + l).join('<br>')}</div>`
      }
    }
    banner.innerHTML = `
      <div class="update-banner" style="flex-direction:column;align-items:stretch;gap:12px">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="update-icon">✨</span>
          <div class="update-text"><strong>v${data.version}</strong> 업데이트 준비 완료</div>
        </div>
        ${notesHtml}
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn-update" onclick="document.getElementById('update-banner').style.display='none';updateReady=false" style="background:#E5E7EB;color:#555">나중에</button>
          <button class="btn-update" onclick="window.api.installUpdate()">지금 설치</button>
        </div>
      </div>
    `
  } else if (data.status === 'up-to-date') {
    banner.style.display = 'block'
    banner.innerHTML = `
      <div class="update-banner">
        <span class="update-icon">✅</span>
        <div class="update-text">최신 버전입니다</div>
        <button class="btn-update" onclick="document.getElementById('update-banner').style.display='none'" style="background:#E5E7EB;color:#555">닫기</button>
      </div>
    `
  } else if (data.status === 'installing') {
    banner.style.display = 'block'
    banner.innerHTML = `
      <div class="update-banner">
        <span class="update-icon">⏳</span>
        <div class="update-text">업데이트 설치 중... 잠시 후 앱이 재시작됩니다</div>
      </div>
    `
  } else if (data.status === 'error') {
    updateReady = false
    banner.style.display = 'block'
    banner.innerHTML = `
      <div class="update-banner">
        <span class="update-icon">⚠️</span>
        <div class="update-text">${data.message || '업데이트 확인 실패'}</div>
        <button class="btn-update" onclick="document.getElementById('update-banner').style.display='none'" style="background:#E5E7EB;color:#555">닫기</button>
      </div>
    `
    setTimeout(() => { banner.style.display = 'none' }, 5000)
  }
})

// ── Settings Panel ──
function openSettings() {
  document.getElementById('settings-overlay').style.display = 'block'
  document.getElementById('settings-panel').style.display = 'block'
  // 현재 스케일 값 반영
  const config = window._cachedConfig || {}
  const scale = config.uiScale || 100
  document.getElementById('ui-scale-slider').value = scale
  document.getElementById('ui-scale-label').textContent = scale + '%'
  // 앱 버전 표시
  window.api.getAppVersion().then(v => {
    document.getElementById('settings-version').textContent = 'v' + v
  })
}
window.openSettings = openSettings

function closeSettings() {
  document.getElementById('settings-overlay').style.display = 'none'
  document.getElementById('settings-panel').style.display = 'none'
}
window.closeSettings = closeSettings

function setUiScale(val) {
  val = parseInt(val)
  document.getElementById('ui-scale-label').textContent = val + '%'
  // CSS zoom 적용 (titlebar 제외한 전체)
  const factor = val / 100
  document.querySelectorAll('.screen').forEach(s => { s.style.zoom = factor })
  // 설정 저장
  window.api.saveConfig({ uiScale: val })
  if (window._cachedConfig) window._cachedConfig.uiScale = val
}
window.setUiScale = setUiScale

function resetUiScale() {
  setUiScale(100)
  document.getElementById('ui-scale-slider').value = 100
}
window.resetUiScale = resetUiScale

function applyUiScale(val) {
  if (!val || val === 100) {
    document.querySelectorAll('.screen').forEach(s => { s.style.zoom = '' })
    return
  }
  const factor = val / 100
  document.querySelectorAll('.screen').forEach(s => { s.style.zoom = factor })
}

document.getElementById('btn-settings').addEventListener('click', openSettings)

// ── Init: check saved config ──
;(async () => {
  const config = await window.api.getConfig()
  window._cachedConfig = config

  // 저장된 UI 스케일 적용
  if (config.uiScale && config.uiScale !== 100) {
    applyUiScale(config.uiScale)
  }

  if (config.uid) {
    currentUser = { uid: config.uid, name: config.name || '', email: config.email || '' }
    selectedFolder = config.watchDir || null

    if (selectedFolder) {
      // UID + 폴더 모두 있으면 바로 동기화 시작
      showScreen('sync-screen')
      updateSyncUserLabel()
      fileStatuses.clear()
      renderFileList()
      await window.api.startSync({ uid: currentUser.uid, watchDir: selectedFolder })
    setTimeout(peekTrashOnce, 4000)
    } else {
      showSetup()
    }
  }
})()

/* ══════════════════════════════════════════════════════════
   휴지통 — 2026-08-31
   같은 파일이 여러 벌 올라간 것을 찾아 고객이 직접 정리한다.

   ⚠️ 우리가 지우지 않는다. 후보만 보여주고 고객이 남길 것을 고른다.
      판정 근거에 따라 말이 다르다:
        완전히 같은 파일  바이트 지문이 같다 — 미리보기 하나만 보여준다.
                        (썸네일은 업로드마다 다른 프레임이 잡혀서
                         나란히 놓으면 다른 영상처럼 보인다. 한 번 데였다.)
        같은 영상        화면 지문이 가깝다 — 재생해서 확인 권함
        확인 필요        크기만 같다 — 반드시 재생
   ══════════════════════════════════════════════════════════ */
let trashData = null
/* ⚠️ 예전엔 '남길 것 하나' 를 골랐다. 그런데 사람이 화면에서 하려는 일은
   "이 파일을 지운다" 지 "이 파일을 남긴다" 가 아니다. 셋 이상일 때도
   남길 것 하나만 고르면 나머지가 통째로 날아가 무섭다.
   그래서 지울 것을 하나씩 표시하는 방식으로 바꿨다. 최소 한 장은 남는다. */
const trashDel = new Map()    // 무리 번호 → 지울 자산 id 모음(Set)

const LV = {
  sure:   { t: '완전히 같은 파일입니다', c: '#1f9d55', sub: '바이트까지 똑같습니다. 안심하고 정리하세요.' },
  likely: { t: '같은 영상으로 보입니다', c: '#c08a2e', sub: '다시 내보낸 것 같습니다. 재생해서 확인하세요.' },
  maybe:  { t: '확인이 필요합니다',      c: '#b0624a', sub: '크기만 같습니다. 반드시 재생해서 확인하세요.' },
}
const tMB = n => (n / 1048576).toFixed(1)
const tGB = n => (n / 1073741824).toFixed(2)
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

let trashedList = null   // 이미 휴지통에 넣은 것들

async function loadTrash() {
  const pane = document.getElementById('trash-pane')
  pane.innerHTML = '<div style="padding:30px 0;text-align:center;color:#888;font-size:12px">중복을 찾는 중…</div>'
  // ⚠️ 되돌릴 길이 없으면 '휴지통' 이 아니라 즉시 삭제다. 넣은 것도 같이 보여준다.
  trashedList = await window.api.listTrashed().catch(() => null)
  const r = await window.api.findDuplicates()
  if (r?.error) {
    pane.innerHTML = `<div style="padding:30px 0;text-align:center;color:#b0624a;font-size:12px">${esc(r.error)}</div>`
    return
  }
  trashData = r
  trashDel.clear()
  /* 기본값: 맨 위(프로젝트에 들어 있는 · 먼저 올라온 것) 한 장만 남기고
     나머지는 지울 것으로 미리 표시해 둔다. 사람이 손대면 바뀐다. */
  r.groups.forEach((g, i) => trashDel.set(i, new Set(g.items.slice(1).map(a => a.id))))
  markTrashTab()
  renderTrash()
}

function renderTrash() {
  const pane = document.getElementById('trash-pane')
  const d = trashData
  if (!d || !d.groups.length) {
    pane.innerHTML = '<div style="padding:36px 0;text-align:center;color:#888;font-size:12px">중복 파일이 없습니다</div>'
    return
  }
  // 고객이 고른 대로 다시 계산 — 남길 것 빼고 나머지가 비는 값
  // ⚠️ 비는 값은 안전한 무리만 센다. 두 프로젝트에 다 살아있는 건
  //    지워도 자리가 안 빈다 — 넣으면 "10GB 비울 수 있어요" 가 거짓말이 된다.
  let free = 0
  d.groups.forEach((g, i) => {
    if (g.kind === 'shared') return
    const del = trashDel.get(i) || new Set()
    g.items.forEach(a => { if (del.has(a.id)) free += a.fileSize })
  })

  const head = `
    <div style="background:#fff;border:1px solid #e3e2e8;border-radius:12px;padding:14px 16px;
                display:flex;align-items:center;gap:14px;margin-bottom:12px;flex-wrap:wrap">
      <div><div style="font-size:20px;font-weight:700">${tGB(d.usedBytes)} GB</div>
           <div style="font-size:11px;color:#8b8892">사용 중 · 파일 ${d.assetCount}개</div></div>
      <div style="margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end">
        <span style="font-size:15px">🗑</span>
        <b style="font-size:17px;color:#1f9d55">${tGB(free)} GB</b>
        <span style="font-size:11px;color:#8b8892">비울 수 있어요</span>
        <button onclick="applyTrash()" ${free ? '' : 'disabled'}
          style="background:${free ? '#17161c' : '#c9c8cf'};color:#fff;border:0;border-radius:8px;
                 padding:9px 16px;font-size:12px;font-weight:600;white-space:nowrap;
                 cursor:${free ? 'pointer' : 'default'}">정리하기</button>
      </div>
    </div>`

  // ── 휴지통에 넣은 것 — 30일 안에는 되돌릴 수 있다 ──
  const t = trashedList
  const trashed = (t && !t.error && t.items?.length) ? `
    <section style="background:#fff;border:1px solid #e3e2e8;border-radius:12px;padding:13px 15px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
        <span style="font-size:13px">🗑</span><b style="font-size:13px">휴지통에 넣은 것</b>
        <em style="font-style:normal;color:#8b8892;font-size:11px;margin-left:auto">${t.items.length}개 · ${tGB(t.bytes)} GB</em>
      </div>
      <p style="margin:0 0 10px;color:#78757f;font-size:11px">남은 기간이 지나면 완전히 지워집니다. 그 전에는 되돌릴 수 있습니다.</p>
      <div style="display:flex;flex-direction:column;gap:5px;max-height:230px;overflow:auto">
        ${t.items.slice(0, 40).map(a => `
          <div style="display:flex;align-items:center;gap:9px;border:1px solid #eceaf0;border-radius:8px;padding:7px 9px">
            <b style="font-size:11.5px;flex:1;word-break:break-all">${esc(a.fileName)}</b>
            <span style="font-size:10.5px;color:#8b8892">${tMB(a.fileSize)} MB</span>
            <span style="font-size:10.5px;color:${a.daysLeft <= 3 ? '#b0624a' : '#8b8892'}">${a.daysLeft}일 남음</span>
            <button onclick="restoreOne('${a.id}')"
              style="border:1px solid #dcdbe2;background:#fff;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer">되돌리기</button>
          </div>`).join('')}
      </div>
      ${t.items.length > 40 ? `<p style="margin:8px 0 0;font-size:11px;color:#8b8892">… 그리고 ${t.items.length - 40}개 더</p>` : ''}
      <button onclick="restoreAll()" style="margin-top:9px;border:1px solid #dcdbe2;background:#fff;
        border-radius:7px;padding:6px 13px;font-size:11.5px;cursor:pointer">전부 되돌리기</button>
    </section>` : ''

  const body = d.groups.map((g, i) => {
    const lv = LV[g.level] || LV.maybe
    const del = trashDel.get(i) || new Set()
    const lastOne = g.items.length - del.size <= 1   // 마지막 한 장은 못 지운다
    const thumb = g.items.find(a => a.thumb)
    const one = g.level === 'sure'
    // ⚠️ 사진에 '재생' 을 붙이면 안 된다. 영상만.
    const play = a => (a.isVideo && a.play)
      ? `<button onclick="window.api.openExternal('${esc(a.play)}')"
           style="position:absolute;bottom:6px;left:6px;background:rgba(0,0,0,.62);color:#fff;border:0;
                  border-radius:99px;padding:4px 10px;font-size:10.5px;cursor:pointer">▶ 재생</button>` : ''
    const reveal = a => `<button onclick="revealAsset('${esc(a.folder)}','${esc(a.fileName)}')"
        style="background:#fff;border:1px solid #dcdbe2;border-radius:6px;padding:4px 9px;font-size:11px;cursor:pointer">📁 폴더 열기</button>`
    const delBtn = a => {
      const on = del.has(a.id)
      /* 지워질 것 = 빨강. 남을 것 = 회색 테두리.
         마지막 한 장에는 삭제를 못 걸리게 막는다 — 무리째 사라지면 복구가 곤란하다. */
      if (!on && lastOne) return `<span style="border:1px solid #dcdbe2;border-radius:6px;padding:4px 11px;
          font-size:11px;color:#a4a1ab;background:#f7f6f9">남습니다</span>`
      return `<button onclick="toggleDel(${i},'${a.id}')"
        style="border:1px solid ${on ? '#c0392b' : '#dcdbe2'};border-radius:6px;padding:4px 11px;
               font-size:11px;cursor:pointer;background:${on ? '#c0392b' : '#fff'};
               color:${on ? '#fff' : '#8a4a3c'};font-weight:${on ? '600' : '400'}">${on ? '삭제함 · 되돌리기' : '이 파일 삭제'}</button>`
    }
    const loc = a => `
      <div style="border:1px solid ${del.has(a.id) ? '#e8c4bd' : '#17161c'};border-radius:8px;padding:9px 10px;
                  background:${del.has(a.id) ? '#fdf6f4' : '#fff'};opacity:${del.has(a.id) ? '.72' : '1'};
                  display:flex;flex-direction:column;gap:3px;min-width:0">
        <span style="font-size:11px;padding:2px 6px;border-radius:4px;align-self:flex-start;max-width:100%;
                     overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
                     background:${a.orphan ? '#fbe9e4' : '#eceaf0'};color:${a.orphan ? '#a3543c' : '#4a4854'}">
          ${esc(a.folder)}${a.orphan ? ' · 프로젝트 없음' : ''}</span>
        <b style="font-size:12px;word-break:break-all">${esc(a.fileName)}</b>
        <span style="font-size:10.5px;color:#a4a1ab">${esc((a.createdAt || '').slice(0, 10))}</span>
        <span style="display:flex;gap:5px;margin-top:4px">${reveal(a)}${delBtn(a)}</span>
      </div>`
    const card = a => `
      <div style="flex:1 1 200px;min-width:0;border:1px solid #e6e5ea;border-radius:9px;overflow:hidden;background:#fafafa">
        <div style="position:relative;aspect-ratio:16/10;background:#111;display:grid;place-items:center;overflow:hidden">
          ${a.thumb ? `<img src="${esc(a.thumb)}" style="width:100%;height:100%;object-fit:cover">`
                    : '<span style="color:#666;font-size:11px">미리보기 없음</span>'}${play(a)}</div>
        ${loc(a)}
      </div>`
    const warn = g.kind === 'shared'
      ? `<div style="background:#fdf3ec;border:1px solid #f0d9c8;border-radius:8px;padding:9px 11px;
                     margin-bottom:10px;font-size:11.5px;color:#8a4a2c;line-height:1.55">
           ⚠️ 두 프로젝트 모두에 들어 있는 파일입니다.
           지워도 저장 공간은 안 줄고, <b>그 프로젝트에서 사진이 사라집니다.</b>
           일부러 두 곳에 넣은 것이라면 그대로 두세요.</div>` : ''
    const inner = one
      ? `<div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
           <div style="position:relative;flex:1 1 190px;min-width:150px;max-width:260px;aspect-ratio:16/10;background:#111;border-radius:8px;
                       display:grid;place-items:center;overflow:hidden">
             ${thumb ? `<img src="${esc(thumb.thumb)}" style="width:100%;height:100%;object-fit:cover">`
                     : '<span style="color:#666;font-size:11px">미리보기 없음</span>'}${thumb ? play(thumb) : ''}</div>
           <div style="flex:1 1 200px;min-width:0;display:flex;flex-direction:column;gap:7px">${g.items.map(loc).join('')}</div>
         </div>`
      : `<div style="display:flex;gap:10px;flex-wrap:wrap">${g.items.map(card).join('')}</div>`
    return `
      <section style="background:#fff;border:1px solid #e3e2e8;border-radius:12px;padding:13px 15px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
          <i style="width:8px;height:8px;border-radius:50%;background:${lv.c};display:inline-block"></i>
          <b style="font-size:13px">${lv.t}</b>
          <em style="font-style:normal;color:#8b8892;font-size:11px;margin-left:auto">${tMB(g.items[0].fileSize)} MB × ${g.items.length}개</em>
        </div>
        <p style="margin:0 0 11px;color:#78757f;font-size:11px">${lv.sub}</p>
        ${warn}${inner}
      </section>`
  }).join('')

  pane.innerHTML = head + trashed + body
}

/* 탭 이름 옆에 비울 수 있는 용량을 적는다 — 열어보기 전에도 값어치가 보이게 */
function markTrashTab() {
  const btn = document.getElementById('tab-trash')
  if (!btn || !trashData) return
  const g = tGB(trashData.freeableBytes || 0)
  btn.textContent = Number(g) > 0.01 ? `휴지통 ${g}GB` : '휴지통'
}

/* 앱을 켜두면 한 번은 조용히 확인해 둔다. 탭을 안 눌러도 용량이 보이게. */
let trashPeeked = false
async function peekTrashOnce() {
  if (trashPeeked) return
  trashPeeked = true
  try {
    const r = await window.api.findDuplicates()
    if (r && !r.error) { trashData = r; markTrashTab() }
  } catch {}
}

function toggleDel(groupIdx, assetId) {
  const s = trashDel.get(groupIdx) || new Set()
  if (s.has(assetId)) s.delete(assetId)
  else s.add(assetId)
  trashDel.set(groupIdx, s)
  renderTrash()
}

async function revealAsset(folder, fileName) {
  const r = await window.api.revealInFolder({ folder, fileName })
  if (!r?.ok) alert(r?.error || '폴더를 열 수 없습니다')
}

async function restoreOne(id) {
  const r = await window.api.untrashAssets([id])
  if (r?.error) { alert(r.error); return }
  loadTrash()
}

async function restoreAll() {
  const ids = (trashedList?.items || []).map(a => a.id)
  if (!ids.length) return
  if (!confirm(`${ids.length}개를 되돌립니다. 계속할까요?`)) return
  const r = await window.api.untrashAssets(ids)
  if (r?.error) { alert(r.error); return }
  alert(`${r.restored}개를 되돌렸습니다.`)
  loadTrash()
}

async function applyTrash() {
  // 두 프로젝트에 다 살아있는 무리는 '정리하기' 에서 뺀다.
  // 지우려면 그 무리에서 직접 골라야 한다 — 실수로 사진이 사라지면 안 된다.
  const ids = []
  trashData.groups.forEach((g, i) => {
    if (g.kind === 'shared') return
    const del = trashDel.get(i) || new Set()
    g.items.forEach(a => { if (del.has(a.id)) ids.push(a.id) })
  })
  if (!ids.length) return
  const bytes = trashData.groups.reduce((n, g, i) => {
    if (g.kind === 'shared') return n
    const del = trashDel.get(i) || new Set()
    return n + g.items.reduce((m, a) => m + (del.has(a.id) ? a.fileSize : 0), 0)
  }, 0)
  if (!confirm(`${ids.length}개 · ${tGB(bytes)}GB 를 휴지통에 넣습니다.\n\n30일 동안은 되돌릴 수 있고, 그 뒤에 완전히 지워집니다.\n계속할까요?`)) return
  const r = await window.api.trashAssets(ids)
  if (r?.error) { alert(r.error); return }
  alert(`${r.moved}개를 휴지통에 넣었습니다.\n30일 안에는 되돌릴 수 있습니다.`)
  loadTrash()
}

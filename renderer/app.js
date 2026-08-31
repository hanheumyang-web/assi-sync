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
      alert('로그인하지 못했어요. 다시 시도해 주세요.\n' + result.error)
      btn.disabled = false
      btn.innerHTML = originalHTML
      return
    }
    currentUser = { uid: result.uid, name: result.name || '', email: result.email || '' }
    selectedFolder = (await window.api.getConfig()).watchDir || null
    showSetup()
  } catch (err) {
    alert('로그인하지 못했어요. 다시 시도해 주세요.\n' + err.message)
    btn.disabled = false
    btn.innerHTML = originalHTML
  }
}

document.getElementById('btn-google-login').addEventListener('click', () => handleOAuthLogin('google'))
document.getElementById('btn-apple-login').addEventListener('click', () => handleOAuthLogin('apple'))

// ── UID Login (fallback) ──
/* ⚠️ 예전엔 여기서 UID 를 그대로 받아 저장했다. 비밀번호 확인 없이
   아이디만으로 들어가는 셈이라 위험하기도 했고, 애초에 고객이 자기 UID 를
   알 방법이 없었다. 웹과 같은 이메일 로그인으로 바꾼다. */
function showEmailError(msg) {
  const el = document.getElementById('email-error')
  el.textContent = msg
  el.style.display = msg ? 'block' : 'none'
}

async function doEmailLogin() {
  const btn = document.getElementById('btn-email-login')
  const email = document.getElementById('email-input').value.trim()
  const password = document.getElementById('password-input').value
  showEmailError('')
  if (!email) { document.getElementById('email-input').focus(); return }
  if (!password) { document.getElementById('password-input').focus(); return }

  const was = btn.textContent
  btn.textContent = '로그인 중...'
  btn.disabled = true
  try {
    const r = await window.api.emailLogin(email, password)
    if (!r || r.error) { showEmailError((r && r.error) || '로그인하지 못했어요.'); return }
    currentUser = { uid: r.uid, name: r.name || '', email: r.email || email }
    const config = await window.api.getConfig()
    selectedFolder = config.watchDir || null
    /* 비밀번호는 화면에도 남기지 않는다 */
    document.getElementById('password-input').value = ''
    showSetup()
  } catch (err) {
    showEmailError('로그인하지 못했어요. 잠시 후 다시 시도해 주세요.')
  } finally {
    btn.textContent = was
    btn.disabled = false
  }
}

document.getElementById('btn-email-login').addEventListener('click', doEmailLogin)
document.getElementById('password-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') doEmailLogin()
})

function showSetup() {
  document.getElementById('welcome-name').textContent = currentUser.name || '반가워요'
  document.getElementById('welcome-email').textContent = currentUser.email || ''
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
/* 로그아웃은 두 화면에 있다 — 준비 화면과 동기화 화면.
   같은 일을 하므로 한 곳에서 처리한다. */
document.getElementById('btn-logout-setup')?.addEventListener('click', () =>
  document.getElementById('btn-logout').click())

document.getElementById('btn-logout').addEventListener('click', async () => {
  await window.api.stopSync()
  // 계정 바꿀 때 다른 사람 파일 충돌 막으려고 sync state 도 청소 — 다음 로그인 시 fresh sync.
  try { await window.api.clearSyncState() } catch {}
  await window.api.saveConfig({ uid: '', watchDir: '', name: '', email: '', idToken: '', refreshToken: '' })
  currentUser = null
  selectedFolder = null
  document.getElementById('email-input').value = ''
  document.getElementById('password-input').value = ''
  showScreen('login-screen')
})

// ── Retry ──
document.getElementById('btn-retry-all').addEventListener('click', () => {
  window.api.retryAllFailed()
})

// ── Rescan (새로고침) + 공유 체크 ──
document.getElementById('btn-trash')?.addEventListener('click', openTrash)

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
    infoEl.textContent = `파일 ${data.total}개를 찾았어요`
  } else if (data.phase === 'syncing') {
    statusEl.innerHTML = '<span class="dot syncing"></span>동기화 중...'
    infoEl.textContent = `${data.completed} / ${data.total}`
  } else if (data.phase === 'watching') {
    statusEl.innerHTML = '<span class="dot watching"></span>동기화 중'
    infoEl.textContent = `파일 ${data.total}개를 맞췄어요`
    refreshSyncedFolders()
  } else if (data.phase === 'share_uploading') {
    statusEl.innerHTML = '<span class="dot syncing"></span>원본을 그대로 올리는 중'
    infoEl.textContent = `${data.projectName || '공유'} · ${data.completed} / ${data.total}`
  } else if (data.phase === 'share_complete') {
    statusEl.innerHTML = '<span class="dot watching"></span>동기화 중'
    infoEl.textContent = `원본 ${data.total}개를 올렸어요`
    setTimeout(() => {
      infoEl.textContent = `파일 ${Object.keys(window._lastSyncTotal || {}).length || data.total}개를 맞췄어요`
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
        <button class="btn-pending remove" onclick="removePendingFolder('${f.key}')">지우기</button>
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
        <button class="btn-pending resync" onclick="resyncFolder('${f.key}')">다시 올리기</button>
        <button class="btn-pending remove" onclick="deleteSyncedFolder('${f.key}')">지우기</button>
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
  if (!confirm(`${keys.length}개 폴더를 다시 올릴게요. 계속할까요?`)) return
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
  if (!confirm(`${keys.length}개 폴더를 지울게요. 서버에 올라간 것도 함께 삭제됩니다.`)) return
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
  if (!confirm('이 폴더의 올린 기록과 서버에 있는 것을 지울게요. 계속할까요?')) return
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
      alert(`삭제 실패: ${r?.error || '알 수 없는 문제가 생겼어요'}`)
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
  if (!data) { pane.innerHTML = '<div style="padding:20px;color:#999;font-size:11px">아직 연결한 폴더가 없어요</div>'; return }
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
          alert('옮기지 못했어요.\n' + result.error)
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
    container.innerHTML = '<div style="padding:8px;color:#ccc;font-size:10px">이 폴더는 비어 있어요</div>'
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
        alert('이름을 바꾸지 못했어요.\n' + result.error)
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
        alert('이름을 바꾸지 못했어요.\n' + result.error)
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
        <div class="update-text">${data.message || '업데이트를 확인하지 못했어요'}</div>
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
/* ⚠️ 예전엔 '무리 번호 → 고른 파일' 로 기억했다. 탐색기에 갔다 돌아오면
   목록을 다시 불러오면서 번호가 바뀌고, 골라둔 게 통째로 날아갔다.
   실제로 "삭제가 된 거야 만 거야" 라는 말을 들었다.
   파일 자체를 기억하면 다시 불러와도 그대로 남는다. */
const trashDel = new Set()   // 지울 자산 id

/* '알아요' 로 접은 경고. 무리는 순서가 바뀔 수 있으니 번호가 아니라
   파일 지문으로 기억한다 — 번호로 기억하면 엉뚱한 경고가 접힌다. */
const groupKey = g => (g.items[0] && (g.items[0].contentHash || g.items[0].id)) || ''
let warnHidden = new Set()
try { warnHidden = new Set(JSON.parse(localStorage.getItem('trash-warn-hidden') || '[]')) } catch {}
function hideWarn(key) {
  warnHidden.add(key)
  try { localStorage.setItem('trash-warn-hidden', JSON.stringify([...warnHidden])) } catch {}
  renderTrash()
}

/* ⚠️ 여기 말투가 번역체라는 지적을 받았다. '바이트까지 똑같습니다' 같은 말은
   우리끼리 쓰는 말이지 고객의 말이 아니다.
   기준: 사진 찍는 사람이 읽고 바로 무슨 뜻인지 알 것. 전문 용어 금지. */
/* 문구 규칙 — 2026-08-31
 *
 * ⚠️ 처음엔 여기에 설명 문장을 썼다.
 *    "똑같은 파일이 여러 개 있습니다 / 내용이 하나도 다르지 않습니다. 하나만 남기면 됩니다."
 *    번역기 돌린 것 같다는 말을 들었고, 맞는 말이었다. 이유는 셋이다.
 *      ① 화면이 이미 보여주는 걸 문장으로 또 말했다 (파일 두 장이 나란히 있는데)
 *      ② 당연한 걸 설명했다 ("하나만 남기면 됩니다")
 *      ③ '-합니다' 체를 썼다. 국내 서비스는 해요체를 쓴다.
 *
 * 그래서 규칙을 이렇게 둔다:
 *   · 목록 머리글은 문장이 아니라 **라벨**이다. 개수·용량은 옆에 숫자로.
 *   · 보조 설명은 **화면이 못 보여주는 새 정보**가 있을 때만 붙인다.
 *     '똑같은 파일' 은 근거가 확실하니 더 할 말이 없다 — 그래서 비운다.
 *     '같은 영상 같아요' 는 확실치 않으니 무엇을 해야 하는지 한 줄 붙인다.
 *   · 말투는 해요체. 소리 내어 읽어서 어색하면 다시 쓴다.
 */
const LV = {
  sure:   { t: '중복 파일',        c: '#1f9d55', sub: '' },
  likely: { t: '같은 영상 같아요', c: '#c08a2e', sub: '재생해서 확인해 주세요' },
  maybe:  { t: '크기만 같아요',    c: '#b0624a', sub: '내용은 다를 수 있어요' },
}
const tMB = n => (n / 1048576).toFixed(1)
const tGB = n => (n / 1073741824).toFixed(2)
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

let trashedList = null   // 이미 휴지통에 넣은 것들


/* ══════════════════════════════════════════════════════════
   휴지통 — 지운 파일이 실제로 어디 있는지 보여주는 자리.
   ⚠️ 예전엔 중복 정리 화면 안에 묻혀 있어서, 지우고 나서
      "그래서 어디 갔냐" 를 알 수가 없었다.
   30일 동안 여기 있다가 서버가 영구 삭제한다.
   ══════════════════════════════════════════════════════════ */
async function openTrash() {
  let box = document.getElementById('trash-modal')
  if (!box) {
    box = document.createElement('div')
    box.id = 'trash-modal'
    box.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(20,19,26,.45);' +
      'display:flex;align-items:flex-end;justify-content:center'
    box.addEventListener('click', e => { if (e.target === box) box.remove() })
    document.body.appendChild(box)
  }
  box.innerHTML = '<div style="background:#f7f6f9;width:100%;max-height:86vh;border-radius:16px 16px 0 0;' +
    'padding:16px;overflow:auto;font-size:12px">불러오는 중…</div>'
  const t = await window.api.listTrashed().catch(e => ({ error: e?.message || '알 수 없는 문제' }))
  trashedList = t
  const inner = box.firstChild

  if (t && t.error) {
    inner.innerHTML = `<div style="color:#8a4a2c;line-height:1.6">휴지통을 불러오지 못했어요.
      <div style="font-size:10.5px;color:#a8836f;margin-top:4px">${esc(String(t.error).slice(0, 120))}</div></div>`
    return
  }
  const items = (t && t.items) || []
  const hiddenCount = warnHidden.size
  inner.innerHTML = `
    <div style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
      <b style="font-size:14px">휴지통</b>
      <span style="font-size:11px;color:#8b8892">${items.length}개 · ${tGB(t?.bytes || 0)} GB</span>
      <button onclick="document.getElementById('trash-modal').remove()"
        style="margin-left:auto;border:1px solid #dcdbe2;background:#fff;border-radius:8px;
               padding:6px 12px;font-size:12px;cursor:pointer">닫기</button>
    </div>
    <p style="margin:0 0 12px;color:#78757f;font-size:11.5px;line-height:1.55">
      30일이 지나면 완전히 지워져요. 그 전에는 언제든 되돌릴 수 있어요.<br>
      컴퓨터의 원본은 동기화 폴더 안 <b>_Trash</b> 로 옮겨져 있어요.</p>
    ${items.length ? `
      <div style="display:flex;flex-direction:column;gap:5px">
        ${items.slice(0, 200).map(a => `
          <div style="display:flex;align-items:center;gap:9px;background:#fff;border:1px solid #eceaf0;
                      border-radius:8px;padding:7px 10px">
            <b style="font-size:11.5px;flex:1;word-break:break-all">${esc(a.fileName)}</b>
            <span style="font-size:10.5px;color:#8b8892;white-space:nowrap">${tMB(a.fileSize)} MB</span>
            <span style="font-size:10.5px;white-space:nowrap;color:${a.daysLeft <= 3 ? '#b0624a' : '#8b8892'}">${a.daysLeft}일 남음</span>
            <button onclick="restoreOne('${a.id}')"
              style="border:1px solid #dcdbe2;background:#fff;border-radius:6px;padding:4px 10px;
                     font-size:11px;cursor:pointer;white-space:nowrap">되돌리기</button>
          </div>`).join('')}
      </div>
      <button onclick="restoreAll()" style="margin-top:10px;border:1px solid #dcdbe2;background:#fff;
        border-radius:8px;padding:7px 14px;font-size:12px;cursor:pointer">전부 되돌리기</button>`
      : '<div style="padding:26px 0;text-align:center;color:#8b8892">휴지통이 비어 있어요</div>'}
    ${hiddenCount ? `
      <div style="margin-top:14px;border-top:1px solid #e6e5ea;padding-top:12px">
        <b style="font-size:12px">숨긴 제안 ${hiddenCount}개</b>
        <p style="margin:4px 0 8px;color:#78757f;font-size:11px">'메시지 삭제하기' 로 뺀 중복 제안이에요.</p>
        <button onclick="unhideWarns()" style="border:1px solid #dcdbe2;background:#fff;border-radius:8px;
          padding:6px 12px;font-size:11.5px;cursor:pointer">다시 보기</button>
      </div>` : ''}`
}

function unhideWarns() {
  warnHidden.clear()
  try { localStorage.setItem('trash-warn-hidden', '[]') } catch {}
  document.getElementById('trash-modal')?.remove()
  renderTrash()
}

async function loadTrash() {
  const pane = document.getElementById('trash-pane')
  pane.innerHTML = '<div style="padding:30px 0;text-align:center;color:#888;font-size:12px">중복을 찾는 중…</div>'
  // ⚠️ 되돌릴 길이 없으면 '휴지통' 이 아니라 즉시 삭제다. 넣은 것도 같이 보여준다.
  /* ⚠️ 예전엔 .catch(() => null) 로 실패를 조용히 삼켰다.
     서버 조회가 색인 문제로 통째로 실패하고 있었는데 화면엔 아무 말도 없어서,
     "휴지통이 비었다" 와 "못 불러왔다" 가 구분이 안 됐다. 실제로 79개가 있었다.
     못 불러온 건 못 불러왔다고 말해야 한다. */
  trashedList = await window.api.listTrashed().catch(e => ({ error: e?.message || '알 수 없는 문제' }))
  const r = await window.api.findDuplicates()
  if (r?.error) {
    pane.innerHTML = `<div style="padding:30px 0;text-align:center;color:#b0624a;font-size:12px">${esc(r.error)}</div>`
    return
  }
  trashData = r
  /* ⚠️ 예전엔 열자마자 한 장만 남기고 나머지를 지울 것으로 미리 골라뒀다.
     그랬더니 아무것도 안 눌렀는데 '삭제됨' 이 떠서
     "왜 삭제한다고 안 했는데 삭제됐냐" 는 말을 들었다.
     지우는 건 되돌리기 어려운 일이다. 아무것도 안 고른 채로 시작한다.
     한 번에 고르고 싶은 사람을 위해 위에 '한 장씩만 남기고 모두' 를 둔다. */
  /* 다시 불러와도 골라둔 것은 지킨다. 없어진 파일만 정리한다. */
  const alive = new Set(r.groups.flatMap(g => g.items.map(a => a.id)))
  for (const id of [...trashDel]) if (!alive.has(id)) trashDel.delete(id)
  markTrashTab()
  renderTrash()
}

function renderTrash() {
  const pane = document.getElementById('trash-pane')
  const d = trashData
  if (!d || !d.groups.length) {
    pane.innerHTML = '<div style="padding:36px 0;text-align:center;color:#888;font-size:12px">중복된 파일이 없어요</div>'
    return
  }
  // 고객이 고른 대로 다시 계산 — 남길 것 빼고 나머지가 비는 값
  // ⚠️ 비는 값은 안전한 무리만 센다. 두 프로젝트에 다 살아있는 건
  //    지워도 자리가 안 빈다 — 넣으면 "10GB 비울 수 있어요" 가 거짓말이 된다.
  let free = 0, picked = 0, maxFree = 0, pickedBytes = 0
  d.groups.forEach((g, i) => {
    const del = trashDel
    // 고른 개수·크기는 위험한 무리도 센다 (사람이 직접 골랐으니)
    g.items.forEach(a => { if (del.has(a.id)) { picked++; pickedBytes += a.fileSize } })
    if (g.kind === 'shared') return
    g.items.forEach(a => { if (del.has(a.id)) free += a.fileSize })
    // 한 장씩만 남겼을 때 비는 값 — '여기까지 비울 수 있어요' 의 근거
    g.items.slice(1).forEach(a => { maxFree += a.fileSize })
  })

  const head = `
    <div style="background:#fff;border:1px solid #e3e2e8;border-radius:12px;padding:14px 16px;
                display:flex;align-items:center;gap:14px;margin-bottom:12px;flex-wrap:wrap">
      <div><div style="font-size:20px;font-weight:700">${tGB(d.usedBytes)} GB</div>
           <div style="font-size:11px;color:#8b8892">쓰는 중 · 파일 ${d.assetCount}개</div></div>
      <div style="margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end">
        <span style="font-size:15px">🗑</span>
        <b style="font-size:17px;color:${picked ? '#1f9d55' : '#8b8892'}">${picked ? '' : '최대 '}${tGB(picked ? free : maxFree)} GB</b>
        <span style="font-size:11px;color:#8b8892">비울 수 있어요</span>
        <button onclick="applyTrash()" ${picked ? '' : 'disabled'}
          style="background:${picked ? '#17161c' : '#c9c8cf'};color:#fff;border:0;border-radius:8px;
                 padding:9px 16px;font-size:12px;font-weight:600;white-space:nowrap;
                 cursor:${picked ? 'pointer' : 'default'}">${picked ? `${picked}개 휴지통으로 이동` : '휴지통으로 이동'}</button>
      </div>
    </div>`

  // ── 휴지통에 넣은 것 — 30일 안에는 되돌릴 수 있다 ──
  const t = trashedList
  /* 못 불러왔으면 그렇게 말한다. 빈 것과 다르다. */
  const trashedErr = (t && t.error) ? `
    <section style="background:#fdf3ec;border:1px solid #f0d9c8;border-radius:12px;padding:12px 14px;
                    margin-bottom:10px;font-size:11.5px;color:#8a4a2c;line-height:1.55">
      휴지통 목록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.
      <div style="margin-top:4px;color:#a8836f;font-size:10.5px">${esc(String(t.error).slice(0, 90))}</div>
    </section>` : ''
  /* ⚠️ 휴지통 목록이 중복 정리 화면 안에 묻혀 있었다. 지우고 나서
     어디로 갔는지 찾을 수가 없었다. 별도 창으로 뺀다 (아래 openTrash).
     여기서는 '몇 개 들어 있다' 만 알리고 들어가는 자리를 둔다. */
  const inBin = (t && !t.error && t.items?.length) ? t.items.length : 0
  const trashed = inBin ? `
    <button onclick="openTrash()"
      style="width:100%;text-align:left;background:#fff;border:1px solid #e3e2e8;border-radius:12px;
             padding:12px 15px;margin-bottom:10px;cursor:pointer;display:flex;align-items:center;gap:9px">
      <span style="font-size:14px">🗑</span>
      <b style="font-size:12.5px">휴지통에 ${inBin}개</b>
      <span style="font-size:11px;color:#8b8892">${tGB(t.bytes)} GB · 30일 안에는 되돌릴 수 있어요</span>
      <span style="margin-left:auto;font-size:11.5px;color:#6c6976">열기 →</span>
    </button>` : ''

  /* 숨긴 제안은 목록에서 아예 뺀다 — 메시지만 감추는 게 아니다. */
  const body = d.groups.map((g, i) => {
    if (g.kind === 'shared' && warnHidden.has(groupKey(g))) return ''
    const lv = LV[g.level] || LV.maybe
    const del = trashDel
    const allGone = g.items.every(a => del.has(a.id))
    const picked0 = g.items.filter(a => del.has(a.id)).length
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
    /* ⚠️ 예전엔 '삭제함 · 되돌리기' 라고 썼다. 아직 아무것도 안 지웠는데
       이미 지운 것처럼 읽혀서 "왜 삭제한다고 안 했는데 삭제됐냐" 는 말을 들었다.
       지금은 '앞으로 이렇게 할 계획' 이라는 게 드러나는 말만 쓴다. */
    /* ⚠️ 예전엔 여기에 '먼저 올라온 파일이라 이걸 남깁니다' 같은 설명을 달았다.
       기본 선택이 있던 시절의 문장인데, 이제 사람이 직접 고르므로 그 말이
       사실과 달라진다 — 실제로 고아 파일을 남겨 놓고 '먼저 올라와서' 라고
       적혀 있었다. 설명 대신, 잘못 고른 것 같을 때만 짚어준다. */
    const keepWhy = a => {
      if (del.has(a.id) || del.size === 0) return ''
      // 프로젝트에 든 걸 지우고 어디에도 없는 걸 남기려 한다 — 대개 반대로 하려던 것이다
      const losingLive = g.items.some(x => del.has(x.id) && !x.orphan)
      if (!(a.orphan && losingLive)) return ''
      return `<span style="font-size:10.5px;color:#a3402c;margin-top:2px;line-height:1.5">
        프로젝트에 있는 쪽을 남기는 게 좋아요</span>`
    }
    const delBtn = a => {
      const on = del.has(a.id)
      /* 짝이 되는 말이어야 한다 — 하기 ↔ 되돌리기.
         '지울 예정 / 그냥 두기' 는 짝이 안 맞아 뭘 누르는 건지 헷갈렸다. */
      /* 마지막 한 장은 못 지운다 — 무리째 사라지면 되돌리기가 곤란하다.
         단, 아무것도 안 고른 상태에서는 이 딱지를 안 보여준다 (아직 고를 게 남았다). */
      /* 이 무리에서 하나라도 골랐고 이건 안 골랐으면 = 남을 것.
         누르면 이것도 지울 수 있다 (무리째 지우는 것도 이제 허용한다). */
      if (!on && picked0 > 0) return `<span style="display:inline-flex;align-items:center;gap:6px">
          <span style="border:1px solid #cfe0cd;border-radius:6px;padding:4px 10px;
                       font-size:11px;color:#4a7a44;background:#f2f8f1">남길 것</span>
          <button onclick="toggleDel(${i},'${a.id}')"
            style="border:1px solid #e2c4bb;border-radius:6px;padding:4px 10px;
                   font-size:11px;cursor:pointer;background:#fff;color:#a3402c">삭제하기</button>
        </span>`
      /* ⚠️ 여기 '삭제됨' 이라고 썼다가, 아직 아무것도 안 지웠는데 지운 것처럼
         읽혀서 "삭제가 된 거야 만 거야" 라는 말을 들었다.
         실제로 지우는 건 아래 막대의 '휴지통으로 옮기기' 다. 그때까지는 표시일 뿐이다. */
      if (on) return `<span style="display:inline-flex;align-items:center;gap:6px">
          <span style="background:#c0392b;color:#fff;border-radius:6px;padding:4px 10px;
                       font-size:11px;font-weight:600">지울 것</span>
          <button onclick="toggleDel(${i},'${a.id}')"
            style="border:1px solid #dcdbe2;border-radius:6px;padding:4px 10px;
                   font-size:11px;cursor:pointer;background:#fff;color:#6c6976">되돌리기</button>
        </span>`
      return `<button onclick="toggleDel(${i},'${a.id}')"
        style="border:1px solid #d9b3a8;border-radius:6px;padding:4px 11px;
               font-size:11px;cursor:pointer;background:#fff;color:#a3402c">삭제하기</button>`
    }
    const loc = a => `
      <div style="border:1px solid ${del.has(a.id) ? '#e8c4bd' : '#17161c'};border-radius:8px;padding:9px 10px;
                  background:${del.has(a.id) ? '#fdf6f4' : '#fff'};opacity:${del.has(a.id) ? '.72' : '1'};
                  display:flex;flex-direction:column;gap:3px;min-width:0">
        <span style="font-size:11px;padding:2px 6px;border-radius:4px;align-self:flex-start;max-width:100%;
                     overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
                     background:${a.orphan ? '#fbe9e4' : '#eceaf0'};color:${a.orphan ? '#a3543c' : '#4a4854'}">
          ${a.orphan ? '프로젝트 없음' : esc(a.folder)}</span>
        <b style="font-size:12px;word-break:break-all">${esc(a.fileName)}</b>
        <span style="font-size:10.5px;color:#a4a1ab">
          ${tMB(a.fileSize)} MB · ${esc((a.createdAt || '').slice(0, 10))}</span>
        ${keepWhy(a)}
        <span style="display:flex;gap:5px;margin-top:4px">${reveal(a)}${delBtn(a)}</span>
      </div>`
    const card = a => `
      <div style="flex:1 1 200px;min-width:0;border:1px solid #e6e5ea;border-radius:9px;overflow:hidden;background:#fafafa">
        <div style="position:relative;aspect-ratio:16/10;background:#111;display:grid;place-items:center;overflow:hidden">
          ${a.thumb ? `<img src="${esc(a.thumb)}" style="width:100%;height:100%;object-fit:cover">`
                    : '<span style="color:#666;font-size:11px">미리보기 없음</span>'}${play(a)}</div>
        ${loc(a)}
      </div>`
    /* ⚠️ 같은 사진을 두 프로젝트에 '일부러' 넣어두는 경우가 있다.
       그런 사람에게는 이 경고가 매번 뜨는 잔소리가 된다. 접을 수 있게 한다.
       접은 것은 앱을 꺼도 기억한다 — 매번 다시 접게 하면 안 접느니만 못하다. */
    /* ⚠️ '메시지 삭제하기' 는 메시지만 숨기는 게 아니라
       이 무리를 제안에서 통째로 빼는 것이다 (일부러 두 곳에 넣은 사람에게는
       매번 뜨는 잔소리다). 실수로 눌렀으면 휴지통의 '숨긴 제안' 에서 되살린다. */
    const warn = (g.kind === 'shared' && !warnHidden.has(groupKey(g)))
      ? `<div style="background:#fdf3ec;border:1px solid #f0d9c8;border-radius:8px;padding:9px 11px;
                     margin-bottom:10px;font-size:11.5px;color:#8a4a2c;line-height:1.55;
                     display:flex;gap:8px;align-items:flex-start">
           <span style="flex:1"><b>두 프로젝트에 모두</b> 들어 있어요.
           지워도 저장 공간은 안 줄고, <b>그 프로젝트에서만 사진이 없어져요.</b></span>
           <button onclick="hideWarn('${groupKey(g)}')"
             style="flex:0 0 auto;background:#fff;border:1px solid #e6cdbc;border-radius:6px;
                    padding:3px 9px;font-size:11px;color:#8a4a2c;cursor:pointer;
                    white-space:nowrap">메시지 삭제하기</button>
         </div>` : ''
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
          <button onclick="toggleWholeGroup(${i})"
            style="border:1px solid ${allGone ? '#dcdbe2' : '#e2c4bb'};border-radius:6px;padding:3px 9px;
                   font-size:11px;cursor:pointer;white-space:nowrap;background:#fff;
                   color:${allGone ? '#6c6976' : '#a3402c'}">${allGone
                     ? '되돌리기' : (g.items.length === 2 ? '둘 다 삭제' : `${g.items.length}개 모두 삭제`)}</button>
        </div>
        ${allGone ? `<div style="background:#fdf3ec;border:1px solid #f0d9c8;border-radius:8px;
             padding:8px 10px;margin:8px 0 0;font-size:11.5px;color:#8a4a2c;line-height:1.5">
             이 파일은 한 장도 안 남아요. 30일 안에는 되돌릴 수 있어요.</div>` : ''}
        ${lv.sub ? `<p style="margin:0 0 11px;color:#78757f;font-size:11px">${lv.sub}</p>` : '<div style="height:9px"></div>'}
        ${warn}${inner}
      </section>`
  }).join('')

  /* ⚠️ 지우는 버튼이 화면 맨 위에만 있었다. 아래에서 파일을 고르고 나면
     그 버튼이 화면 밖이라, 골라놓고도 '지워진 거야 만 거야' 가 됐다.
     고른 게 있으면 아래에 붙어 따라다니는 막대를 띄운다. */
  const barHtml = picked ? `
    <div style="position:sticky;bottom:0;z-index:5;margin:12px -2px 0;padding:11px 13px;
                background:#17161c;border-radius:12px;display:flex;align-items:center;gap:10px;
                box-shadow:0 -6px 22px rgba(0,0,0,.22)">
      <b style="color:#fff;font-size:13px">${picked}개 선택</b>
      <span style="color:#a8a5b2;font-size:11.5px">${tMB(pickedBytes)} MB${
        free < pickedBytes ? ` · 공간은 ${tMB(free)} MB 만 줄어요` : ''}</span>
      <button onclick="clearTrashPick()"
        style="margin-left:auto;background:none;border:1px solid #45434f;border-radius:8px;
               padding:7px 12px;font-size:12px;color:#c9c7d0;cursor:pointer">선택 해제</button>
      <button onclick="applyTrash()"
        style="background:#fff;color:#17161c;border:0;border-radius:8px;padding:8px 15px;
               font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap">휴지통으로 옮기기</button>
    </div>` : ''
  pane.innerHTML = head + trashedErr + trashed + body + barHtml
}

/* 탭 이름 옆에 비울 수 있는 용량을 적는다 — 열어보기 전에도 값어치가 보이게 */
function markTrashTab() {
  const btn = document.getElementById('tab-trash')
  if (!btn || !trashData) return
  /* ⚠️ 여기서 매번 글자를 덮어써서, index.html 에서 '중복 파일' 로 바꿔놔도
     화면에는 계속 '휴지통' 이 떴다. 이름은 한 곳에서만 정한다. */
  const g = tGB(trashData.freeableBytes || 0)
  btn.textContent = Number(g) > 0.01 ? `중복 파일 ${g}GB` : '중복 파일'
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

/* 한 장씩만 남기고 나머지를 고른다.
   ⚠️ 위험한 무리(두 프로젝트에 걸친 것)는 건드리지 않는다 — 지우면 자리도 안 비고
      한쪽 프로젝트에서 사진만 사라진다. 그건 사람이 직접 골라야 한다. */
function pickAllDupes() {
  trashData.groups.forEach((g) => {
    if (g.kind === 'shared') return
    g.items.slice(1).forEach(a => trashDel.add(a.id))
  })
  renderTrash()
}

function toggleDel(groupIdx, assetId) {
  if (trashDel.has(assetId)) trashDel.delete(assetId)
  else trashDel.add(assetId)
  renderTrash()
}

/* 한 무리를 통째로 — 둘 다(또는 전부) 지우고 싶을 때.
   ⚠️ 예전엔 '마지막 한 장은 못 지운다' 로 막아뒀다. 그런데 두 장 다
      어느 프로젝트에도 없는 파일이면 둘 다 지우는 게 맞다. 막지 않는다.
      대신 무리가 통째로 사라진다는 걸 그 자리에서 알려준다. */
function clearTrashPick() { trashDel.clear(); renderTrash() }

function toggleWholeGroup(groupIdx) {
  const g = trashData.groups[groupIdx]
  const all = g.items.every(a => trashDel.has(a.id))
  g.items.forEach(a => all ? trashDel.delete(a.id) : trashDel.add(a.id))
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
  if (!confirm(`파일 ${ids.length}개(${tGB(bytes)}GB)를 휴지통으로 옮길게요.\n30일 안에는 되돌릴 수 있어요.\n\n계속할까요?`)) return
  const r = await window.api.untrashAssets(ids)
  if (r?.error) { alert(r.error); return }
  alert(`${r.restored}개를 되돌렸어요.`)
  loadTrash()
}

async function applyTrash() {
  /* ⚠️ 예전엔 '두 프로젝트에 다 있는 무리' 를 여기서 통째로 걸렀다.
     그런데 그건 자동으로 고를 때 빼야 하는 것이지, **사람이 직접 고른 것**까지
     버리면 안 된다. 실제로 3개를 골라 눌렀는데 아무 일도 안 일어났다 —
     아무 말도 없이. 고른 것은 고른 대로 옮긴다. */
  const ids = []
  let riskyCount = 0
  trashData.groups.forEach((g) => {
    g.items.forEach(a => {
      if (!trashDel.has(a.id)) return
      ids.push(a.id)
      if (g.kind === 'shared') riskyCount++
    })
  })
  if (!ids.length) { alert('고른 파일이 없어요.'); return }
  /* 고른 크기와 실제로 비는 크기는 다르다. 두 프로젝트에 다 있는 파일은
     지워도 저장 공간이 안 준다 — 숨기면 나중에 "왜 안 줄었냐" 가 된다. */
  let total = 0
  trashData.groups.forEach(g => g.items.forEach(a => { if (trashDel.has(a.id)) total += a.fileSize }))
  const lines = [`파일 ${ids.length}개(${tMB(total)}MB)를 휴지통으로 옮길게요.`]
  if (riskyCount) lines.push(`이 중 ${riskyCount}개는 두 프로젝트에 모두 있어서 저장 공간은 안 줄어요.`)
  lines.push('컴퓨터의 원본도 동기화 폴더 안 _Trash 로 옮겨져요.')
  lines.push('', '30일 안에는 되돌릴 수 있어요.', '계속할까요?')
  if (!confirm(lines.join('\n'))) return
  const r = await window.api.trashAssets(ids)
  if (r?.error) { alert(r.error); return }
  alert(`${r.moved}개를 휴지통으로 옮겼어요.${
    r.localMoved ? `\n컴퓨터의 원본 ${r.localMoved}개도 _Trash 로 옮겼어요.` : ''
  }\n30일 안에는 되돌릴 수 있어요.`)
  loadTrash()
}

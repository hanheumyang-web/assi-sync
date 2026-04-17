// Firebase client SDK (loaded via CDN in a real app, but here we use the preload bridge)
// Auth is handled via Google OAuth popup

let currentUser = null
let selectedFolder = null
const fileStatuses = new Map() // path → status data

// ── Screen Navigation ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  document.getElementById(id).classList.add('active')
}

// ── Google Login ──
document.getElementById('btn-google-login').addEventListener('click', async () => {
  const btn = document.getElementById('btn-google-login')
  btn.disabled = true
  btn.innerHTML = '<span style="font-size:13px">로그인 중...</span>'
  try {
    const result = await window.api.googleLogin()
    if (result.error) {
      alert('로그인 실패: ' + result.error)
      btn.disabled = false
      btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" style="width:20px;height:20px"> Google 계정으로 로그인'
      return
    }
    currentUser = { uid: result.uid, name: result.name || '', email: result.email || '' }
    selectedFolder = (await window.api.getConfig()).watchDir || null
    showSetup()
  } catch (err) {
    alert('로그인 실패: ' + err.message)
    btn.disabled = false
    btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" style="width:20px;height:20px"> Google 계정으로 로그인'
  }
})

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
  }
})

// ── Open Web ──
document.getElementById('btn-open-web').addEventListener('click', () => {
  window.api.openExternal('https://assifolio.com')
})

// ── Logout ──
document.getElementById('btn-logout').addEventListener('click', async () => {
  await window.api.stopSync()
  await window.api.saveConfig({ uid: '', watchDir: '', name: '', email: '' })
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
// ─── Keynote 가져오기 ───
document.getElementById('btn-keynote-import').addEventListener('click', async () => {
  const btn = document.getElementById('btn-keynote-import')
  // 1) API 키 확인
  let apiKey = await window.api.keynoteGetApiKey()
  if (!apiKey) {
    apiKey = prompt('Claude API 키를 입력하세요\n(AI 자동 분류에 사용, 1회 호출 약 $0.09)\nhttps://console.anthropic.com/settings/keys\n\n비워두면 "미분류" 단일 그룹으로만 만듭니다.')
    if (apiKey && apiKey.trim()) {
      await window.api.keynoteSetApiKey(apiKey.trim())
    } else {
      apiKey = null
    }
  }
  // 2) 파일 선택
  const filePath = await window.api.keynoteSelectFile()
  if (!filePath) return
  // 3) 파싱 시작 + UI 잠금
  btn.disabled = true
  const origHtml = btn.innerHTML
  btn.innerHTML = '<span>⏳</span> 분석 중... 파싱'
  window.api.onKeynoteProgress(p => {
    if (p.phase === 'parse' && p.done) btn.innerHTML = `<span>⏳</span> 파싱 ${p.done}/${p.total}`
    else if (p.phase === 'extract' && p.done) btn.innerHTML = `<span>🖼️</span> 이미지 추출 ${p.done}/${p.total}`
    else if (p.phase === 'ai' && p.status === 'calling') btn.innerHTML = '<span>🤖</span> Claude 분류 중...'
    else if (p.phase === 'ai' && p.status === 'done') btn.innerHTML = `<span>✓</span> ${p.projects}개 프로젝트 · 검수 창 열림`
  })
  try {
    const r = await window.api.keynoteParse({ filePath, apiKey })
    if (!r.ok) alert('Keynote 분석 실패: ' + r.error)
    else btn.innerHTML = `<span>✓</span> ${r.projectsCount}개 프로젝트 · 검수 창 확인하세요`
  } catch (e) {
    alert('오류: ' + e.message)
  } finally {
    setTimeout(() => { btn.disabled = false; btn.innerHTML = origHtml }, 4000)
  }
})

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

// ── Explorer Mode ──
let dragNode = null

document.getElementById('tab-activity').addEventListener('click', () => switchTab('activity'))
document.getElementById('tab-explorer').addEventListener('click', () => switchTab('explorer'))

function switchTab(tab) {
  const isExp = tab === 'explorer'
  document.getElementById('tab-activity').style.background = isExp ? '#fff' : '#111'
  document.getElementById('tab-activity').style.color = isExp ? '#666' : '#fff'
  document.getElementById('tab-explorer').style.background = isExp ? '#111' : '#fff'
  document.getElementById('tab-explorer').style.color = isExp ? '#fff' : '#666'
  document.getElementById('explorer-pane').style.display = isExp ? 'block' : 'none'
  document.getElementById('activity-pane').style.display = isExp ? 'none' : 'flex'
  document.getElementById('activity-pane').style.flexDirection = 'column'
  if (isExp) refreshExplorer()
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
    } else {
      showSetup()
    }
  }
})()

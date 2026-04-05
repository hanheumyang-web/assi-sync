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
  fileStatuses.clear()
  renderFileList()
  await window.api.startSync({ uid: currentUser.uid, watchDir: selectedFolder })
})

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

// ── New Folder Approval ──
window.api.onNewFolder((data) => {
  const container = document.getElementById('folder-toasts')
  const toast = document.createElement('div')
  toast.className = 'folder-toast'
  toast.id = 'toast-' + data.id

  const fileText = data.fileCount > 0 ? `${data.fileCount}개 파일` : '파일'

  toast.innerHTML = `
    <div class="toast-title">📁 새 폴더 감지: ${data.name}</div>
    <div class="toast-desc">${data.path} · ${fileText}</div>
    <div class="toast-actions">
      <button class="toast-btn deny" onclick="handleFolderApproval('${data.id}', false)">건너뛰기</button>
      <button class="toast-btn approve" onclick="handleFolderApproval('${data.id}', true)">업로드</button>
      <button class="toast-btn approve" onclick="approveAllPendingToasts()" style="background:#4ADE80;box-shadow:0 2px 8px rgba(74,222,128,0.3)">전체 업로드</button>
    </div>
  `
  container.appendChild(toast)

  // 30초 후 자동 제거
  setTimeout(() => toast.remove(), 30000)
})

function handleFolderApproval(id, approved) {
  window.api.approveFolder(id, approved)
  const toast = document.getElementById('toast-' + id)
  if (toast) toast.remove()
  if (!approved) setTimeout(refreshPendingFolders, 500)
}
window.handleFolderApproval = handleFolderApproval

function approveAllPendingToasts() {
  const toasts = document.querySelectorAll('.folder-toast')
  toasts.forEach(toast => {
    const id = toast.id.replace('toast-', '')
    window.api.approveFolder(id, true)
    toast.remove()
  })
}
window.approveAllPendingToasts = approveAllPendingToasts

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
  list.innerHTML = folders.map(f => `
    <div class="pending-item" id="synced-${f.key.replace(/[^a-zA-Z0-9]/g, '_')}">
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
  } else if (data.status === 'done') {
    statusHtml = '<span class="file-status done">✓</span>'
  } else if (data.status === 'failed') {
    statusHtml = `<button class="btn-retry" onclick="retryFile('${data.path}')">재시도</button>`
  } else if (data.status === 'deleted') {
    statusHtml = '<span class="file-status" style="color:#999">삭제됨</span>'
  }

  item.innerHTML = `
    <div class="file-icon ${iconClass}">${iconEmoji}</div>
    <div class="file-info">
      <div class="file-name">${data.fileName}</div>
      <div class="file-meta">${data.size || ''} ${data.error ? '— ' + data.error : ''}</div>
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

  let done = 0, failed = 0, uploading = 0
  for (const [, data] of fileStatuses) {
    if (data.status === 'done') done++
    else if (data.status === 'failed') failed++
    else if (data.status === 'uploading') uploading++
  }

  const total = done + failed + uploading
  if (total === 0) { bar.style.display = 'none'; return }

  bar.style.display = 'flex'
  let parts = [`<strong>${done}</strong> 완료`]
  if (uploading > 0) parts.push(`${uploading} 업로드 중`)
  if (failed > 0) parts.push(`<span style="color:#EF4444">${failed} 실패</span>`)
  text.innerHTML = parts.join(' · ')

  retryBtn.style.display = failed > 0 ? 'block' : 'none'
}

// ── Init: check saved config ──
;(async () => {
  const config = await window.api.getConfig()
  if (config.uid) {
    currentUser = { uid: config.uid, name: config.name || '', email: config.email || '' }
    selectedFolder = config.watchDir || null

    if (selectedFolder) {
      // UID + 폴더 모두 있으면 바로 동기화 시작
      showScreen('sync-screen')
      fileStatuses.clear()
      renderFileList()
      await window.api.startSync({ uid: currentUser.uid, watchDir: selectedFolder })
    } else {
      showSetup()
    }
  }
})()

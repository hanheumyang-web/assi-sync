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
  window.api.openExternal('https://assi.lat')
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
  document.getElementById('file-list').style.display = isExp ? 'none' : 'flex'
  document.getElementById('synced-section').style.display = isExp ? 'none' : ''
  document.getElementById('pending-section').style.display = isExp ? 'none' : ''
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
  pane.innerHTML = renderTree(data.tree, data.root)
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

  // 썸네일 크기 슬라이더
  const currentSize = parseInt(document.documentElement.style.getPropertyValue('--thumb-size')) || 60
  const sizeBarHtml = `
    <div class="thumb-size-bar">
      <span style="font-size:11px">🖼</span>
      <input type="range" min="32" max="120" value="${currentSize}" oninput="setThumbSize(this.value)">
      <span class="thumb-size-label">${currentSize}px</span>
    </div>
  `

  container.innerHTML = sizeBarHtml + files.map((f, i) => {
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

// ── Thumbnail Size ──
function setThumbSize(val) {
  document.documentElement.style.setProperty('--thumb-size', val + 'px')
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

// ── Tray Menu Actions ──
window.api.onTrayAction((action) => {
  if (action === 'change-folder') {
    document.getElementById('btn-change-folder')?.click()
  } else if (action === 'logout') {
    document.getElementById('btn-logout')?.click()
  } else if (action === 'settings') {
    // 설정 화면으로 이동 (setup 화면 표시)
    if (syncEngine) document.getElementById('btn-stop')?.click()
  }
})

// ── Auto Update UI ──
window.api.onUpdateStatus((data) => {
  const banner = document.getElementById('update-banner')
  if (!banner) return

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
    banner.style.display = 'block'
    banner.innerHTML = `
      <div class="update-banner">
        <span class="update-icon">✨</span>
        <div class="update-text"><strong>v${data.version}</strong> 업데이트 준비 완료</div>
        <button class="btn-update" onclick="window.api.installUpdate()">지금 설치</button>
      </div>
    `
  }
})

// ── Init: check saved config ──
;(async () => {
  const config = await window.api.getConfig()
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

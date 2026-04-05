const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')

let mainWindow = null
let tray = null
const STATE_PATH = path.join(app.getPath('userData'), 'sync-state.json')
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) }
  catch { return {} }
}

function saveConfig(data) {
  const prev = loadConfig()
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...prev, ...data }, null, 2))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 640,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#F4F3EE',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  mainWindow.loadFile('renderer/index.html')

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png'))
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('ASSI Sync')
  tray.on('click', () => mainWindow?.show())
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '열기', click: () => mainWindow?.show() },
    { label: '종료', click: () => { app.isQuitting = true; app.quit() } },
  ]))
}

app.whenReady().then(() => {
  createWindow()
  createTray()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ──── IPC Handlers ────

ipcMain.handle('minimize-window', () => mainWindow?.minimize())
ipcMain.handle('close-window', () => mainWindow?.hide())

// ──── Google OAuth via localhost ────
ipcMain.handle('google-login', async () => {
  return new Promise((resolve) => {
    const port = 18234 + Math.floor(Math.random() * 1000)

    const authHTML = `<!DOCTYPE html><html><head>
      <meta charset="UTF-8">
      <title>ASSI Login</title>
      <style>
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css');
        * { margin:0; padding:0; box-sizing:border-box; font-family:'Pretendard Variable',sans-serif; }
        body { background:#F4F3EE; display:flex; align-items:center; justify-content:center; height:100vh; }
        .card { text-align:center; padding:40px; }
        .logo { font-size:32px; font-weight:900; color:#1A1A1A; }
        .sub { font-size:11px; letter-spacing:0.2em; color:#828DF8; font-weight:700; margin-bottom:24px; }
        .status { font-size:13px; color:#999; margin-top:16px; }
        .spinner { width:24px; height:24px; border:3px solid #ddd; border-top:3px solid #828DF8;
          border-radius:50%; animation:spin 0.8s linear infinite; margin:16px auto; }
        @keyframes spin { to { transform:rotate(360deg) } }
      </style>
      <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
      <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
    </head><body>
      <div class="card">
        <div class="logo">ASSI</div>
        <div class="sub">GOOGLE LOGIN</div>
        <div class="spinner" id="spinner"></div>
        <p class="status" id="status">Google 로그인 중...</p>
      </div>
      <script>
        firebase.initializeApp({
          apiKey: "AIzaSyD-JUPcZ5iIIBEtoCE7YPye0PRP4WTPGgg",
          authDomain: "assi-app-6ea04.firebaseapp.com",
          projectId: "assi-app-6ea04",
        });
        const provider = new firebase.auth.GoogleAuthProvider();
        firebase.auth().signInWithPopup(provider).then(result => {
          const u = result.user;
          document.getElementById('status').textContent = '로그인 성공! 창이 닫힙니다...';
          document.getElementById('spinner').style.display = 'none';
          fetch('/callback?uid=' + encodeURIComponent(u.uid)
            + '&name=' + encodeURIComponent(u.displayName || '')
            + '&email=' + encodeURIComponent(u.email || '')
            + '&photo=' + encodeURIComponent(u.photoURL || ''));
        }).catch(err => {
          document.getElementById('status').textContent = '로그인 실패: ' + err.message;
          document.getElementById('spinner').style.display = 'none';
          setTimeout(() => fetch('/callback?error=' + encodeURIComponent(err.message)), 2000);
        });
      </script>
    </body></html>`

    let authWindow = null
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`)

      if (url.pathname === '/auth') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(authHTML)
      } else if (url.pathname === '/callback') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('OK')

        const uid = url.searchParams.get('uid')
        const error = url.searchParams.get('error')

        setTimeout(() => {
          authWindow?.close()
          authWindow = null
          server.close()

          if (uid) {
            const userData = {
              uid,
              name: url.searchParams.get('name') || '',
              email: url.searchParams.get('email') || '',
              photo: url.searchParams.get('photo') || '',
            }
            saveConfig(userData)
            resolve(userData)
          } else {
            resolve({ error: error || 'Login failed' })
          }
        }, 500)
      } else {
        res.writeHead(404)
        res.end()
      }
    })

    server.listen(port, '127.0.0.1', () => {
      authWindow = new BrowserWindow({
        width: 500,
        height: 650,
        resizable: false,
        parent: mainWindow,
        modal: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      })
      authWindow.setMenuBarVisibility(false)
      authWindow.loadURL(`http://127.0.0.1:${port}/auth`)

      authWindow.on('closed', () => {
        authWindow = null
        server.close()
        resolve({ error: 'Window closed' })
      })
    })
  })
})

ipcMain.handle('get-config', () => loadConfig())

ipcMain.handle('save-config', (_, data) => {
  saveConfig(data)
  return true
})

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '감시할 폴더 선택',
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// ──── Sync Engine (runs in main process) ────
let syncEngine = null

// 새 폴더 확인 대기 큐
const pendingFolderApprovals = new Map()

ipcMain.handle('approve-folder', (_, { id, approved }) => {
  const resolve = pendingFolderApprovals.get(id)
  if (resolve) {
    resolve(approved)
    pendingFolderApprovals.delete(id)
    // 건너뛰기 시 대기 목록 업데이트
    if (!approved && syncEngine) {
      setTimeout(() => {
        mainWindow?.webContents.send('pending-folders-updated', syncEngine.getPendingFolders())
      }, 300)
    }
  }
  return true
})

ipcMain.handle('start-sync', async (_, { uid, watchDir }) => {
  if (syncEngine) {
    syncEngine.stop()
  }

  saveConfig({ uid, watchDir })

  const { SyncEngine } = require('./lib/sync-engine.js')
  // 패키지된 앱: __dirname 안에 있음, 개발: agent 폴더
  let serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json')
  if (!fs.existsSync(serviceAccountPath)) {
    serviceAccountPath = path.join(__dirname, '..', 'agent', 'serviceAccountKey.json')
  }
  syncEngine = new SyncEngine({
    uid,
    watchDir,
    statePath: STATE_PATH,
    serviceAccountPath,
    onProgress: (data) => mainWindow?.webContents.send('sync-progress', data),
    onFileStatus: (data) => mainWindow?.webContents.send('file-status', data),
    onError: (data) => mainWindow?.webContents.send('sync-error', data),
    onFolderRemoved: () => {
      mainWindow?.webContents.send('synced-folders-updated', syncEngine.getSyncedFolders())
    },
    onNewFolder: (data) => {
      return new Promise((resolve) => {
        const id = Date.now().toString()
        pendingFolderApprovals.set(id, resolve)
        mainWindow?.webContents.send('new-folder', { id, ...data })
        // 30초 후 자동 승인 (타임아웃)
        setTimeout(() => {
          if (pendingFolderApprovals.has(id)) {
            pendingFolderApprovals.delete(id)
            resolve(true)
          }
        }, 30000)
      })
    },
  })

  await syncEngine.start()
  return true
})

ipcMain.handle('stop-sync', () => {
  syncEngine?.stop()
  syncEngine = null
  return true
})

ipcMain.handle('retry-file', async (_, relativePath) => {
  if (!syncEngine) return false
  await syncEngine.retryFile(relativePath)
  return true
})

ipcMain.handle('retry-all-failed', async () => {
  if (!syncEngine) return false
  await syncEngine.retryAllFailed()
  return true
})

ipcMain.handle('get-pending-folders', () => {
  if (!syncEngine) return []
  return syncEngine.getPendingFolders()
})

ipcMain.handle('approve-pending-folder', async (_, projectKey) => {
  if (!syncEngine) return false
  await syncEngine.approvePendingFolder(projectKey)
  mainWindow?.webContents.send('pending-folders-updated', syncEngine.getPendingFolders())
  return true
})

ipcMain.handle('remove-pending-folder', (_, projectKey) => {
  if (!syncEngine) return false
  syncEngine.removePendingFolder(projectKey)
  mainWindow?.webContents.send('pending-folders-updated', syncEngine.getPendingFolders())
  return true
})

ipcMain.handle('get-synced-folders', () => {
  if (!syncEngine) return []
  return syncEngine.getSyncedFolders()
})

ipcMain.handle('resync-folder', async (_, projectKey) => {
  if (!syncEngine) return false
  await syncEngine.resyncFolder(projectKey)
  mainWindow?.webContents.send('synced-folders-updated', syncEngine.getSyncedFolders())
  return true
})

ipcMain.handle('delete-synced-folder', async (_, projectKey) => {
  if (!syncEngine) return false
  await syncEngine.deleteSyncedFolder(projectKey)
  mainWindow?.webContents.send('synced-folders-updated', syncEngine.getSyncedFolders())
  return true
})

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
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

  // ──── Auto Updater ────
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-status', { status: 'available', version: info.version })
  })
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-status', { status: 'downloading', percent: Math.round(progress.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-status', { status: 'ready', version: info.version })
  })
  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater]', err.message)
  })

  // 앱 시작 5초 후 업데이트 체크
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 5000)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ──── IPC Handlers ────

ipcMain.handle('minimize-window', () => mainWindow?.minimize())
ipcMain.handle('close-window', () => mainWindow?.hide())
ipcMain.handle('check-update', () => autoUpdater.checkForUpdatesAndNotify())
ipcMain.handle('install-update', () => autoUpdater.quitAndInstall())
ipcMain.handle('get-app-version', () => app.getVersion())

// ──── Google OAuth via localhost ────
// Now captures ID token + refresh token for secure API calls
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
        firebase.auth().signInWithPopup(provider).then(async (result) => {
          const u = result.user;
          const idToken = await u.getIdToken();
          document.getElementById('status').textContent = '로그인 성공! 창이 닫힙니다...';
          document.getElementById('spinner').style.display = 'none';
          fetch('/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uid: u.uid,
              name: u.displayName || '',
              email: u.email || '',
              photo: u.photoURL || '',
              idToken: idToken,
              refreshToken: u.refreshToken || '',
            }),
          });
        }).catch(err => {
          document.getElementById('status').textContent = '로그인 실패: ' + err.message;
          document.getElementById('spinner').style.display = 'none';
          setTimeout(() => fetch('/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message }),
          }), 2000);
        });
      </script>
    </body></html>`

    let authWindow = null
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`)

      if (url.pathname === '/auth') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(authHTML)
      } else if (url.pathname === '/callback' && req.method === 'POST') {
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'text/plain' })
          res.end('OK')

          let data
          try { data = JSON.parse(body) } catch { data = { error: 'Parse error' } }

          setTimeout(() => {
            authWindow?.close()
            authWindow = null
            server.close()

            if (data.uid) {
              const userData = {
                uid: data.uid,
                name: data.name || '',
                email: data.email || '',
                photo: data.photo || '',
                idToken: data.idToken || '',
                refreshToken: data.refreshToken || '',
              }
              saveConfig(userData)
              resolve(userData)
            } else {
              resolve({ error: data.error || 'Login failed' })
            }
          }, 500)
        })
      } else if (url.pathname === '/callback' && req.method === 'GET') {
        // Fallback for GET (backward compat)
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
// Now uses ApiClient instead of Firebase Admin SDK
let syncEngine = null

const pendingFolderApprovals = new Map()

ipcMain.handle('approve-folder', (_, { id, approved }) => {
  const resolve = pendingFolderApprovals.get(id)
  if (resolve) {
    resolve(approved)
    pendingFolderApprovals.delete(id)
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

  // Load tokens from config
  const config = loadConfig()
  const idToken = config.idToken
  const refreshToken = config.refreshToken

  if (!idToken) {
    mainWindow?.webContents.send('sync-error', { message: '인증 토큰이 없습니다. 다시 로그인해주세요.' })
    return false
  }

  // Create API client (no credentials stored locally!)
  const { ApiClient } = require('./lib/api-client.js')
  const api = new ApiClient({
    idToken,
    refreshToken,
    onTokenRefreshed: (tokens) => {
      // Persist refreshed tokens
      saveConfig({ idToken: tokens.idToken, refreshToken: tokens.refreshToken })
    },
  })

  const { SyncEngine } = require('./lib/sync-engine.js')
  syncEngine = new SyncEngine({
    uid,
    watchDir,
    statePath: STATE_PATH,
    api,
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

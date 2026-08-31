const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  /* 맥이면 시스템 버튼을 쓰므로 화면이 가짜 버튼을 감춰야 한다 */
  platform: process.platform,
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  // 휴지통
  findDuplicates: () => ipcRenderer.invoke('find-duplicates'),
  trashAssets: (ids) => ipcRenderer.invoke('trash-assets', ids),
  listTrashed: () => ipcRenderer.invoke('list-trashed'),
  untrashAssets: (ids) => ipcRenderer.invoke('untrash-assets', ids),
  revealInFolder: (loc) => ipcRenderer.invoke('reveal-in-folder', loc),
  saveConfig: (data) => ipcRenderer.invoke('save-config', data),

  // Folder
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  // Sync
  startSync: (opts) => ipcRenderer.invoke('start-sync', opts),
  stopSync: () => ipcRenderer.invoke('stop-sync'),
  // 진단
  diagnoseSync: () => ipcRenderer.invoke('diagnose-sync'),
  forceDownloadAsset: (assetId) => ipcRenderer.invoke('force-download-asset', assetId),
  retryFile: (path) => ipcRenderer.invoke('retry-file', path),
  retryAllFailed: () => ipcRenderer.invoke('retry-all-failed'),
  rescan: () => ipcRenderer.invoke('rescan'),
  checkShares: () => ipcRenderer.invoke('check-shares'),

  // Folder approval
  approveFolder: (id, approved) => ipcRenderer.invoke('approve-folder', { id, approved }),

  // Pending folders
  getPendingFolders: () => ipcRenderer.invoke('get-pending-folders'),
  approvePendingFolder: (key) => ipcRenderer.invoke('approve-pending-folder', key),
  removePendingFolder: (key) => ipcRenderer.invoke('remove-pending-folder', key),

  // Synced folders
  getSyncedFolders: () => ipcRenderer.invoke('get-synced-folders'),
  resyncFolder: (key) => ipcRenderer.invoke('resync-folder', key),
  deleteSyncedFolder: (key) => ipcRenderer.invoke('delete-synced-folder', key),

  // 폴더 삭제 confirm — Finder 에서 동기화 폴더 삭제 시 사용자에게 확인 받는 흐름
  confirmFolderDeletion: (info) => ipcRenderer.invoke('confirm-folder-deletion', info),
  cancelFolderDeletion: () => ipcRenderer.invoke('cancel-folder-deletion'),
  onFolderDeletionRequested: (cb) => ipcRenderer.on('folder-deletion-requested', (_, data) => cb(data)),

  // Events from main
  onSyncProgress: (cb) => ipcRenderer.on('sync-progress', (_, data) => cb(data)),
  onFileStatus: (cb) => ipcRenderer.on('file-status', (_, data) => cb(data)),
  onSyncError: (cb) => ipcRenderer.on('sync-error', (_, data) => cb(data)),
  onNewFolder: (cb) => {
    ipcRenderer.on('new-folder', (_, data) => cb(data))
    ipcRenderer.on('new-folder-auto', (_, data) => cb(data))
  },
  onPendingFoldersUpdated: (cb) => ipcRenderer.on('pending-folders-updated', (_, data) => cb(data)),
  onSyncedFoldersUpdated: (cb) => ipcRenderer.on('synced-folders-updated', (_, data) => cb(data)),

  // Folder tree (explorer mode)
  scanFolderTree: () => ipcRenderer.invoke('scan-folder-tree'),
  moveFolder: (from, to) => ipcRenderer.invoke('move-folder', { from, to }),
  openInExplorer: (p) => ipcRenderer.invoke('open-in-explorer', p),

  // Explorer: rename & reorder
  renameProject: (projectKey, newName) => ipcRenderer.invoke('rename-project', { projectKey, newName }),
  renameFile: (relPath, newFileName) => ipcRenderer.invoke('rename-file', { relPath, newFileName }),
  getProjectFiles: (projectKey) => ipcRenderer.invoke('get-project-files', projectKey),
  reorderFiles: (orderedAssetIds) => ipcRenderer.invoke('reorder-files', orderedAssetIds),

  // Auth
  googleLogin: () => ipcRenderer.invoke('google-login'),
  appleLogin: () => ipcRenderer.invoke('apple-login'),
  emailLogin: (email, password) => ipcRenderer.invoke('email-login', { email, password }),
  clearSyncState: () => ipcRenderer.invoke('clear-sync-state'),

  // Main process 로그 forward — DevTools Console 에 [main] 으로 표시
  onMainLog: (cb) => ipcRenderer.on('main-log', (_, data) => cb(data)),

  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Window controls
  minimize: () => ipcRenderer.invoke('minimize-window'),
  maximize: () => ipcRenderer.invoke('maximize-window'),
  close: () => ipcRenderer.invoke('close-window'),

  // Tray menu actions
  onTrayAction: (cb) => ipcRenderer.on('tray-action', (_, action) => cb(action)),

  // Auto updater
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_, data) => cb(data)),
})

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (data) => ipcRenderer.invoke('save-config', data),

  // Folder
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  // Sync
  startSync: (opts) => ipcRenderer.invoke('start-sync', opts),
  stopSync: () => ipcRenderer.invoke('stop-sync'),
  retryFile: (path) => ipcRenderer.invoke('retry-file', path),
  retryAllFailed: () => ipcRenderer.invoke('retry-all-failed'),

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

  // Window controls
  minimize: () => ipcRenderer.invoke('minimize-window'),
  close: () => ipcRenderer.invoke('close-window'),

  // Auto updater
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_, data) => cb(data)),
})

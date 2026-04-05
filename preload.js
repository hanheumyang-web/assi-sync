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
  onNewFolder: (cb) => ipcRenderer.on('new-folder', (_, data) => cb(data)),
  onPendingFoldersUpdated: (cb) => ipcRenderer.on('pending-folders-updated', (_, data) => cb(data)),
  onSyncedFoldersUpdated: (cb) => ipcRenderer.on('synced-folders-updated', (_, data) => cb(data)),

  // Auth
  googleLogin: () => ipcRenderer.invoke('google-login'),

  // Window controls
  minimize: () => ipcRenderer.invoke('minimize-window'),
  close: () => ipcRenderer.invoke('close-window'),
})

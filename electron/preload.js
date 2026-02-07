const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  chooseRoot: () => ipcRenderer.invoke('dialog:chooseRoot'),
  chooseFiles: () => ipcRenderer.invoke('dialog:chooseFiles'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  addRoot: (payload) => ipcRenderer.invoke('roots:add', payload),
  removeRoot: (payload) => ipcRenderer.invoke('roots:remove', payload),
  renameRoot: (payload) => ipcRenderer.invoke('roots:rename', payload),

  list: (payload) => ipcRenderer.invoke('fs:list', payload),
  search: (payload) => ipcRenderer.invoke('fs:search', payload),
  timeBuckets: (payload) => ipcRenderer.invoke('fs:time-buckets', payload),
  createFolder: (payload) => ipcRenderer.invoke('fs:create-folder', payload),
  createFile: (payload) => ipcRenderer.invoke('fs:create-file', payload),
  upload: (payload) => ipcRenderer.invoke('fs:upload', payload),
  rename: (payload) => ipcRenderer.invoke('fs:rename', payload),
  delete: (payload) => ipcRenderer.invoke('fs:delete', payload),
  move: (payload) => ipcRenderer.invoke('fs:move', payload),
  copy: (payload) => ipcRenderer.invoke('fs:copy', payload),
  pasteFromClipboard: (payload) => ipcRenderer.invoke('fs:paste-clipboard', payload),
  getClipboardFiles: () => ipcRenderer.invoke('clipboard:get-files'),
  importExternal: (payload) => ipcRenderer.invoke('fs:import-external', payload),
  cleanTemp: (payload) => ipcRenderer.invoke('fs:clean-temp', payload),
  deleteByLevel: (payload) => ipcRenderer.invoke('fs:delete-by-level', payload),
  setLevel: (payload) => ipcRenderer.invoke('fs:set-level', payload),
  setCustomTime: (payload) => ipcRenderer.invoke('fs:set-custom-time', payload),
  getOpenWithApps: (payload) => ipcRenderer.invoke('fs:get-open-with-apps', payload),
  getNewFileTypes: () => ipcRenderer.invoke('fs:get-new-file-types'),
  openWithApp: (payload) => ipcRenderer.invoke('fs:open-with-app', payload),
  openWithDialog: (payload) => ipcRenderer.invoke('fs:open-with-dialog', payload),
  openItem: (payload) => ipcRenderer.invoke('fs:open', payload),
  revealItem: (payload) => ipcRenderer.invoke('fs:reveal', payload),
  getIcon: (payload) => ipcRenderer.invoke('fs:get-icon', payload),

  onFsChange: (callback) => ipcRenderer.on('fs-change', (_evt, data) => callback(data)),
  onOperationStart: (callback) =>
    ipcRenderer.on('operation-start', (_evt, data) => callback(data)),
  onOperationEnd: (callback) => ipcRenderer.on('operation-end', (_evt, data) => callback(data)),

  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  windowClose: () => ipcRenderer.invoke('window:close')
});

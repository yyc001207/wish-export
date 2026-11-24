'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('launcher', {
  getStatus: () => ipcRenderer.invoke('LAUNCHER_STATUS'),
  launch: id => ipcRenderer.invoke('LAUNCH_GAME', id),
  openDataDir: () => ipcRenderer.invoke('OPEN_DATA_DIR'),
  pickLegacyDir: () => ipcRenderer.invoke('IMPORT_PICK_DIR'),
  importLegacyData: (dir, game) => ipcRenderer.invoke('IMPORT_LEGACY_DATA', { dir, game }),
  getUpdateState: () => ipcRenderer.invoke('UPDATE_STATUS'),
  checkUpdate: () => ipcRenderer.invoke('UPDATE_CHECK'),
  downloadUpdate: () => ipcRenderer.invoke('UPDATE_DOWNLOAD'),
  installUpdate: () => ipcRenderer.invoke('UPDATE_INSTALL'),
  openReleases: () => ipcRenderer.invoke('OPEN_RELEASES'),
  quit: () => ipcRenderer.invoke('QUIT_APP'),
  onStatusChanged: callback => {
    const listener = (event, status) => callback(status)
    ipcRenderer.on('LAUNCHER_STATUS_CHANGED', listener)
    return () => ipcRenderer.removeListener('LAUNCHER_STATUS_CHANGED', listener)
  },
  onUpdateState: callback => {
    const listener = (event, state) => callback(state)
    ipcRenderer.on('UPDATE_STATE_CHANGED', listener)
    return () => ipcRenderer.removeListener('UPDATE_STATE_CHANGED', listener)
  }
})

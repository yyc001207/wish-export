'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('launcher', {
  getStatus: () => ipcRenderer.invoke('LAUNCHER_STATUS'),
  launch: id => ipcRenderer.invoke('LAUNCH_GAME', id),
  openDataDir: () => ipcRenderer.invoke('OPEN_DATA_DIR'),
  quit: () => ipcRenderer.invoke('QUIT_APP'),
  onStatusChanged: callback => {
    const listener = (event, status) => callback(status)
    ipcRenderer.on('LAUNCHER_STATUS_CHANGED', listener)
    return () => ipcRenderer.removeListener('LAUNCHER_STATUS_CHANGED', listener)
  }
})

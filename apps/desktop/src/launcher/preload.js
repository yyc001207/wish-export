'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('launcher', {
  getStatus: () => ipcRenderer.invoke('LAUNCHER_STATUS'),
  launch: id => ipcRenderer.invoke('LAUNCH_GAME', id),
  openDataDir: () => ipcRenderer.invoke('OPEN_DATA_DIR'),
  quit: () => ipcRenderer.invoke('QUIT_APP')
})

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mirrorApp', {
  dragStart: () => ipcRenderer.send('drag-start'),
  dragMove: () => ipcRenderer.send('drag-move'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  resizeStart: (edge) => ipcRenderer.send('resize-start', edge),
  resizeMove: () => ipcRenderer.send('resize-move'),
  resizeEnd: () => ipcRenderer.send('resize-end'),
  resizeBy: (factor) => ipcRenderer.send('resize-by', factor),

  minimize: () => ipcRenderer.send('win-minimize'),
  close: () => ipcRenderer.send('win-close'),
  toggleFullscreen: () => ipcRenderer.invoke('win-fullscreen'),
  exitFullscreen: () => ipcRenderer.invoke('win-exit-fullscreen'),
  getAlwaysOnTop: () => ipcRenderer.invoke('win-get-ontop'),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('win-set-ontop', value),

  savePhoto: (dataUrl) => ipcRenderer.invoke('save-photo', dataUrl),
  showInFolder: (file) => ipcRenderer.send('show-in-folder', file),

  openBlack: () => ipcRenderer.send('open-black'),
  blackExit: () => ipcRenderer.send('black-exit'),
  monitorOff: () => ipcRenderer.send('black-monitor-off'),
  blackState: () => ipcRenderer.invoke('black-state'),
  toggleDim: () => ipcRenderer.invoke('black-toggle-dim'),
  setDim: (dim) => ipcRenderer.invoke('black-set-dim', !!dim),
  onBlackState: (cb) => ipcRenderer.on('black-state', (_e, state) => cb(state)),

  onVisibility: (cb) => ipcRenderer.on('visibility', (_e, visible) => cb(visible)),
  onFullscreen: (cb) => ipcRenderer.on('fullscreen', (_e, on) => cb(on)),
});

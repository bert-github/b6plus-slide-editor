const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onNewFile: (callback) => ipcRenderer.on('new-file', callback),
  onSaveFile: (callback) => ipcRenderer.on('save-file', callback),
  onSaveFileAs: (callback) => ipcRenderer.on('save-file-as', callback),
  onFileOpened: (callback) => ipcRenderer.on('file-opened', (event, data) => callback(data)),
  
  onAddSlide: (callback) => ipcRenderer.on('add-slide', callback),
  onAddNotes: (callback) => ipcRenderer.on('add-notes', callback),
  onDeleteSlide: (callback) => ipcRenderer.on('delete-slide', callback),
  onSetSlideLayout: (callback) => ipcRenderer.on('set-slide-layout', callback),
  onSetDefaultTransition: (callback) => ipcRenderer.on('set-default-transition', callback),
  onSetSlideTransition: (callback) => ipcRenderer.on('set-slide-transition', callback),
  onSetClear: (callback) => ipcRenderer.on('set-clear', callback),
  onSetTextfit: (callback) => ipcRenderer.on('set-textfit', callback),

  onToggleView: (callback) => ipcRenderer.on('toggle-view', callback),
  onEditCustomCss: (callback) => ipcRenderer.on('edit-custom-css', callback),
  onPlaySlides: (callback) => ipcRenderer.on('play-slides', callback),
  onChangeStylesheet: (callback) => ipcRenderer.on('change-stylesheet', callback),
  
  onUndo: (callback) => ipcRenderer.on('undo', callback),
  onRedo: (callback) => ipcRenderer.on('redo', callback),
  onSelectAll: (callback) => ipcRenderer.on('select-all', callback),
  
  onFormatBold: (callback) => ipcRenderer.on('format-bold', callback),
  onFormatItalic: (callback) => ipcRenderer.on('format-italic', callback),
  onFormatUnderline: (callback) => ipcRenderer.on('format-underline', callback),
  onFormatStrikethrough: (callback) => ipcRenderer.on('format-strikethrough', callback),
  onFormatCode: (callback) => ipcRenderer.on('format-code', callback),
  onFormatLink: (callback) => ipcRenderer.on('format-link', callback),
  onFormatRemoveFormat: (callback) => ipcRenderer.on('format-removeformat', callback),
  onFormatBlock: (callback) => ipcRenderer.on('format-block', (event, data) => callback(data)),
  onFormatUl: (callback) => ipcRenderer.on('format-ul', callback),
  onFormatOl: (callback) => ipcRenderer.on('format-ol', callback),
  onEditClass: (callback) => ipcRenderer.on('edit-class', callback),
  
  onCheckUnsavedChanges: (callback) => ipcRenderer.on('check-unsaved-changes', callback),

  proceedWithClose: () => ipcRenderer.send('proceed-with-close'),
  cancelClose: () => ipcRenderer.send('cancel-close'),
  
  onZoomIn: (callback) => ipcRenderer.on('zoom-in', callback),
  onZoomOut: (callback) => ipcRenderer.on('zoom-out', callback),
  onZoomReset: (callback) => ipcRenderer.on('zoom-reset', callback),
  
  saveFileDialog: (currentPath) => ipcRenderer.invoke('save-file-dialog', currentPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  selectCssFile: () => ipcRenderer.invoke('select-css-file'),
  
  resolvePath: (basePath, relativePath) => ipcRenderer.invoke('resolve-path', basePath, relativePath),
  makeRelativePath: (fromPath, toPath) => ipcRenderer.invoke('make-relative-path', fromPath, toPath),
  isAbsolutePath: (pathStr) => ipcRenderer.invoke('is-absolute-path', pathStr),
  
  getTempFilePath: () => ipcRenderer.invoke('get-temp-file-path'),
  writeTempFile: (content) => ipcRenderer.invoke('write-temp-file', content),

  updateLayoutAndTransitionsMenus: (json) => ipcRenderer.invoke('update-layout-and-transitions-menus', json),

  openInBrowser: (filePath) => ipcRenderer.invoke('open-in-browser', filePath),

  setClear: (value) => ipcRenderer.invoke('set-clear', value),
  setTextfit: (value) => ipcRenderer.invoke('set-textfit', value),
  showHideClear: (show) => ipcRenderer.invoke('show-hide-clear', show)
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fileConverter', {
  selectFiles: () => ipcRenderer.invoke('files:select'),
  selectOutputFolder: () => ipcRenderer.invoke('folder:select'),
  convertFiles: (inputPaths, outputDir, format) =>
    ipcRenderer.invoke('files:convert', inputPaths, outputDir, format),
  openOutputFolder: (folderPath) => ipcRenderer.invoke('folder:open', folderPath),
});

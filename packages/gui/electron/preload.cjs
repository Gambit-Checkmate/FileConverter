const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fileConverter", {
  selectFiles: () => ipcRenderer.invoke("files:select"),
  selectOutputFolder: () => ipcRenderer.invoke("folder:select"),
  convertFiles: (inputPaths, outputDir, format, options) =>
    ipcRenderer.invoke("files:convert", inputPaths, outputDir, format, options),
  request: (action, payload) =>
    ipcRenderer.invoke("worker:request", action, payload),
  saveOutputFile: (format) => ipcRenderer.invoke("file:save-dialog", format),
  exportReport: (kind, report) =>
    ipcRenderer.invoke("report:export", kind, report),
  onProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("conversion:progress", listener);
    return () => ipcRenderer.removeListener("conversion:progress", listener);
  },
  openOutputFolder: (folderPath) =>
    ipcRenderer.invoke("folder:open", folderPath),
  openOutputFile: (filePath) =>
    ipcRenderer.invoke("output:action", "open", filePath),
  revealOutputFile: (filePath) =>
    ipcRenderer.invoke("output:action", "reveal", filePath),
});

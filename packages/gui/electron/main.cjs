const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'FileConverter',
    width: 1000,
    height: 760,
    minWidth: 700,
    minHeight: 550,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  if (process.env.FILECONVERTER_GUI_DEV_URL) {
    mainWindow.loadURL(process.env.FILECONVERTER_GUI_DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function fromMainWindow(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error('Request from an unknown window.');
  }
}

function convertFiles(inputPaths, outputDir, format) {
  const nodeBinary = app.isPackaged
    ? path.join(app.getAppPath(), 'node_modules', 'node', 'bin', process.platform === 'win32' ? 'node.exe' : 'node')
    : 'node';

  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'worker.cjs'), [], {
      execPath: nodeBinary,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let settled = false;
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('message', (message) => {
      if (settled) return;
      settled = true;
      child.disconnect();
      if (message.ok) resolve(message.result);
      else reject(new Error(message.error));
    });
    child.on('error', (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Conversion worker exited with code ${code}. ${stderr.trim()}`));
      }
    });
    child.send({ inputPaths, outputDir, format });
  });
}

app.whenReady().then(() => {
  ipcMain.handle('files:select', async (event) => {
    fromMainWindow(event);
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('folder:select', async (event) => {
    fromMainWindow(event);
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('files:convert', async (event, inputPaths, outputDir, format) => {
    fromMainWindow(event);
    return convertFiles(inputPaths, outputDir, format);
  });
  ipcMain.handle('folder:open', async (event, folderPath) => {
    fromMainWindow(event);
    if (typeof folderPath !== 'string' || !path.isAbsolute(folderPath) ||
        !fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      throw new Error('The output folder does not exist.');
    }
    const error = await shell.openPath(folderPath);
    if (error) throw new Error(error);
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

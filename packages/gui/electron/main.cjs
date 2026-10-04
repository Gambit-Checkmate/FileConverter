const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

if (process.platform === "win32")
  app.setAppUserModelId("no.marentius.fileconverter");

const {
  PathAllowlist,
  assertAllowedExistingPath,
  assertSafeAbsolutePath,
} = require("./path-allowlist.cjs");
const { validateRequest } = require("./request-validation.cjs");
const pathAllowlist = new PathAllowlist();
const saveDestinations = new Set();
let mainWindow;

function createWindow() {
  pathAllowlist.clear();
  saveDestinations.clear();
  mainWindow = new BrowserWindow({
    title: "FileConverter",
    icon: path.join(__dirname, "../icons/icon.png"),
    width: 1180,
    height: 820,
    minWidth: 700,
    minHeight: 550,
    backgroundColor: "#17181b",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on("closed", () => {
    pathAllowlist.clear();
    saveDestinations.clear();
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());

  if (process.env.FILECONVERTER_GUI_DEV_URL) {
    mainWindow.loadURL(process.env.FILECONVERTER_GUI_DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function fromMainWindow(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error("Request from an unknown window.");
  }
}

function requestWorker(action, payload) {
  const nodeBinary = app.isPackaged
    ? path.join(
        app.getAppPath(),
        "node_modules",
        "node",
        "bin",
        process.platform === "win32" ? "node.exe" : "node",
      )
    : "node";

  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, "worker.cjs"), [], {
      execPath: nodeBinary,
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let settled = false;
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("message", (message) => {
      if (message.progress) {
        if (mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send("conversion:progress", message.progress);
        return;
      }
      if (settled) return;
      settled = true;
      child.disconnect();
      if (message.ok) resolve(message.result);
      else reject(new Error(message.error));
    });
    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        reject(
          new Error(
            `Conversion worker exited with code ${code}. ${stderr.trim()}`,
          ),
        );
      }
    });
    child.send({ action, payload });
  });
}

app.whenReady().then(() => {
  ipcMain.handle("files:select", async (event) => {
    fromMainWindow(event);
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile", "multiSelections"],
    });
    if (result.canceled) return [];
    pathAllowlist.remember(result.filePaths);
    return result.filePaths;
  });
  ipcMain.handle("folder:select", async (event) => {
    fromMainWindow(event);
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });
    if (result.canceled) return null;
    pathAllowlist.remember(result.filePaths);
    return result.filePaths[0];
  });
  ipcMain.handle(
    "files:convert",
    async (event, inputPaths, outputDir, format, options = {}) => {
      fromMainWindow(event);
      return requestWorker(
        "convert",
        validateRequest(
          "convert",
          {
            inputPaths,
            outputDir,
            format,
            options,
          },
          pathAllowlist,
          saveDestinations,
        ),
      );
    },
  );
  ipcMain.handle("worker:request", async (event, action, payload = {}) => {
    fromMainWindow(event);
    if (
      ![
        "preview",
        "inputs:inspect",
        "info",
        "presets:list",
        "presets:create",
        "presets:delete",
      ].includes(action)
    )
      throw new Error("Unknown request.");
    const result = await requestWorker(
      action,
      validateRequest(action, payload, pathAllowlist, saveDestinations),
    );
    if (action === "info")
      return {
        ...result,
        guiVersion: app.isPackaged
          ? app.getVersion()
          : require("../package.json").version,
        platform: process.platform,
        arch: process.arch,
        node: process.versions.node,
        electron: process.versions.electron,
        chrome: process.versions.chrome,
      };
    return result;
  });
  ipcMain.handle("file:save-dialog", async (event, format) => {
    fromMainWindow(event);
    if (!["pdf", "txt"].includes(format))
      throw new Error("Invalid output format.");
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (result.canceled) return null;
    const destination =
      path.extname(result.filePath).toLowerCase() === `.${format}`
        ? result.filePath
        : `${result.filePath}.${format}`;
    const safe = assertSafeAbsolutePath(destination);
    const canonical = path.join(
      fs.realpathSync(path.dirname(safe)),
      path.basename(safe),
    );
    saveDestinations.add(canonical);
    return canonical;
  });
  ipcMain.handle("report:export", async (event, kind, report) => {
    fromMainWindow(event);
    if (
      !["result-json", "log-json", "log-text"].includes(kind) ||
      !report ||
      !Array.isArray(report.jobs) ||
      !Array.isArray(report.logs)
    )
      throw new Error("Invalid report.");
    const extension = kind === "log-text" ? "txt" : "json";
    const selected = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `fileconverter-${kind}.${extension}`,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    });
    if (selected.canceled) return null;
    const { logs, ...result } = report;
    let content;
    if (kind === "result-json") content = JSON.stringify(result, null, 2);
    else if (kind === "log-json")
      content = JSON.stringify(
        {
          totalJobs: result.totalJobs,
          successfulJobs: result.successfulJobs,
          failedJobs: result.failedJobs,
          totalDuration: result.totalDuration,
          jobs: logs,
        },
        null,
        2,
      );
    else
      content = [
        `Total jobs: ${result.totalJobs}`,
        `Successful: ${result.successfulJobs}`,
        `Failed: ${result.failedJobs}`,
        `Duration: ${result.totalDuration}ms`,
        ...logs.flatMap((log) => [
          "",
          `Input: ${log.inputPath}`,
          ...(log.outputPaths || [log.outputPath]).map(
            (output) => `Output: ${output}`,
          ),
          `Status: ${log.success ? "success" : "failed"}`,
          `Duration: ${log.duration}ms`,
          ...(log.error ? [`Error: ${log.error}`] : []),
        ]),
      ].join("\n");
    await fs.promises.writeFile(selected.filePath, content, "utf8");
    return selected.filePath;
  });
  ipcMain.handle("folder:open", async (event, folderPath) => {
    fromMainWindow(event);
    const safe = assertSafeAbsolutePath(folderPath);
    const realFolder = fs.realpathSync(safe);
    if (
      ![...saveDestinations].some(
        (destination) => path.dirname(destination) === realFolder,
      )
    )
      assertAllowedExistingPath(realFolder, pathAllowlist);
    if (!fs.statSync(realFolder).isDirectory())
      throw new Error("The output folder does not exist.");
    const error = await shell.openPath(realFolder);
    if (error) throw new Error(error);
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

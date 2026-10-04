import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "fileconverter-launch-"));
const args = [
  "--remote-debugging-address=127.0.0.1",
  "--remote-debugging-port=9142",
  `--user-data-dir=${profile}`,
];
// Ubuntu CI lacks the desktop sandbox setup; this flag is only for this smoke test.
if (process.platform === "linux" && process.env.CI) args.push("--no-sandbox");
const app = spawn(path.resolve(process.argv[2]), args, {
  stdio: ["ignore", "ignore", "pipe"],
});
let diagnostics = "";
app.stderr.on("data", (data) => {
  diagnostics = (diagnostics + data).slice(-8000);
});
app.on("error", (error) => {
  diagnostics += error.message;
});
let socket;
try {
  let page;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (app.exitCode !== null)
      throw new Error(`Installed application exited: ${diagnostics}`);
    try {
      const pages = await (
        await fetch("http://127.0.0.1:9142/json", {
          signal: AbortSignal.timeout(1000),
        })
      ).json();
      page = pages.find(
        (item) => item.type === "page" && item.url.startsWith("file:"),
      );
      if (page) break;
    } catch {
      /* Wait for the installed application's renderer. */
    }
    await delay(500);
  }
  assert.ok(page, `Installed application did not open: ${diagnostics}`);
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const response = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Renderer IPC timed out.")),
      30_000,
    );
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id === 1) {
        clearTimeout(timeout);
        resolve(message);
      }
    });
    socket.send(
      JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: {
          expression:
            '(async () => { for(let i=0;i<50 && !document.querySelector("h1");i++) await new Promise(r=>setTimeout(r,100)); const info=await window.fileConverter.request("info",{}); return {heading:document.querySelector("h1")?.textContent, guiVersion:info.guiVersion, coreVersion:info.coreVersion, conversions:info.conversions.length}; })()',
          awaitPromise: true,
          returnByValue: true,
        },
      }),
    );
  });
  assert.ok(
    !response.error && !response.result.exceptionDetails,
    JSON.stringify(response),
  );
  const info = response.result.result.value;
  const expected = JSON.parse(
    fs.readFileSync("packages/gui/package.json", "utf8"),
  );
  assert.equal(info.guiVersion, expected.version);
  assert.equal(info.coreVersion, expected.dependencies["@fileconverter/core"]);
  assert.ok(info.heading && info.conversions > 0);
  console.log("Installed desktop opens and renderer IPC works:", info);
} finally {
  socket?.close();
  if (process.platform === "win32" && app.pid)
    spawnSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  else app.kill();
  // Profile cleanup may race a child process exiting; it lives only in the runner's temp directory.
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {
    /* Runner/temp cleanup handles open files. */
  }
}

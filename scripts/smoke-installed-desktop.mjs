import assert from "node:assert/strict";
import { fork } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Run against the installed/extracted application, never the checkout's modules.
const appRoot = path.resolve(process.argv[2]);
const installed = JSON.parse(
  fs.readFileSync(path.join(appRoot, "package.json"), "utf8"),
);
const expected = JSON.parse(
  fs.readFileSync("packages/gui/package.json", "utf8"),
);
assert.equal(installed.version, expected.version);
const executable = path.join(
  appRoot,
  "node_modules/node/bin",
  process.platform === "win32" ? "node.exe" : "node",
);
const worker = path.join(appRoot, "electron/worker.cjs");
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "fileconverter-installed-"),
);

async function request(action, payload) {
  const child = fork(worker, [], {
    execPath: executable,
    cwd: directory,
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Installed worker timed out.")),
        30_000,
      );
      const fail = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
      child.once("error", fail);
      child.once("exit", (code) => {
        if (code !== 0) fail(new Error(`Worker exited with ${code}.`));
      });
      child.on("message", (message) => {
        if (!("ok" in message)) return;
        clearTimeout(timeout);
        if (message.ok) resolve(message.result);
        else reject(new Error(message.error));
      });
      child.send({ action, payload });
    });
  } finally {
    child.kill();
  }
}

try {
  const info = await request("info", {});
  assert.equal(info.coreVersion, expected.dependencies["@fileconverter/core"]);
  assert.ok(info.conversions.length > 0);
  const input = path.join(directory, "image.svg");
  const output = path.join(directory, "output");
  fs.mkdirSync(output);
  fs.writeFileSync(
    input,
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>',
  );
  const result = await request("convert", {
    inputPaths: [input],
    outputDir: output,
    format: "png",
    options: { projectDirectory: directory },
  });
  assert.equal(result.successfulJobs, 1);
  const png = fs.readFileSync(path.join(output, "image.png"));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  console.log(
    `Installed FileConverter ${installed.version}: bundled Node, core ${info.coreVersion}, and native image conversion passed.`,
  );
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

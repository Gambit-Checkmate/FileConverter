import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { copyProductionModules, root } from "./locked-production.mjs";
const names = { linux: "linux-x64", win32: "win-x64", darwin: "macos-arm64" };
const name = names[process.platform];
if (
  !name ||
  (process.platform === "darwin"
    ? process.arch !== "arm64"
    : process.arch !== "x64")
)
  throw new Error("Unsupported release platform.");
const artifacts = path.join(root, "artifacts", `cli-${name}`);
fs.mkdirSync(artifacts, { recursive: true });
const stage = fs.mkdtempSync(path.join(os.tmpdir(), "fileconverter-cli-"));
try {
  fs.cpSync(path.join(root, "packages/core/dist"), path.join(stage, "dist"), {
    recursive: true,
  });
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "packages/core/package.json"), "utf8"),
  );
  delete pkg.devDependencies;
  delete pkg.scripts;
  fs.writeFileSync(
    path.join(stage, "package.json"),
    JSON.stringify(pkg, null, 2),
  );
  copyProductionModules(path.join(stage, "node_modules"), "packages/core");
  execFileSync(
    process.execPath,
    [path.join(stage, "dist/cli.js"), "--version"],
    { stdio: "inherit" },
  );
  execFileSync("tar", [
    "-czf",
    path.join(artifacts, `fileconverter-${name}.tar.gz`),
    "-C",
    stage,
    ".",
  ]);
  if (process.platform === "linux") {
    execFileSync(
      process.execPath,
      [
        process.env.npm_execpath,
        "pack",
        "--workspace=packages/core",
        "--ignore-scripts",
        "--pack-destination",
        artifacts,
      ],
      { cwd: root, stdio: "inherit" },
    );
  }
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}

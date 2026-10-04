import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const action = process.argv[2];
if (!["package", "make"].includes(action)) {
  throw new Error("Expected package or make.");
}
if (Number(process.versions.node.split(".")[0]) >= 26) {
  throw new Error(
    "Electron Forge packaging requires Node.js 22 or 24. Use Node.js 22 LTS.",
  );
}

const guiRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const forgeCli = createRequire(import.meta.url).resolve(
  "@electron-forge/cli/dist/electron-forge.js",
);
const result = spawnSync(process.execPath, [forgeCli, "package"], {
  cwd: path.join(guiRoot, ".stage"),
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

if (action === "make") {
  const builderCli = createRequire(import.meta.url).resolve(
    "electron-builder/out/cli/cli.js",
  );
  const packaged = path.join(
    guiRoot,
    "out",
    `FileConverter-${process.platform}-${process.arch}`,
  );
  const app =
    process.platform === "darwin"
      ? path.join(packaged, "FileConverter.app")
      : packaged;
  // Distribution files are public application assets. A restrictive build umask
  // must not make a system-installed DEB readable only by its root owner.
  if (process.platform !== "win32") {
    const normalize = (file) => {
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) return;
      fs.chmodSync(
        file,
        stat.isDirectory() || stat.mode & 0o111 ? 0o755 : 0o644,
      );
      if (stat.isDirectory())
        for (const name of fs.readdirSync(file))
          normalize(path.join(file, name));
    };
    normalize(app);
  }
  const installer = spawnSync(
    process.execPath,
    [
      builderCli,
      "--prepackaged",
      app,
      "--config",
      path.join(guiRoot, "electron-builder.config.cjs"),
      "--publish",
      "never",
    ],
    { cwd: path.join(guiRoot, ".stage"), env: process.env, stdio: "inherit" },
  );
  if (installer.error) throw installer.error;
  if (installer.status !== 0) process.exit(installer.status || 1);
}

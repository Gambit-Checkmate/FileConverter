import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
// Reuse the exact versions/integrities tested by CI, rather than resolving
// package.json ranges afresh while assembling a release.
export function copyProductionModules(destination, workspace) {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "fileconverter-production-"),
  );
  try {
    for (const file of [
      "package.json",
      "package-lock.json",
      "packages/core/package.json",
      "packages/gui/package.json",
    ]) {
      const target = path.join(temporary, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, file), target);
    }
    const npm = process.env.npm_execpath;
    if (!npm) throw new Error("Run packaging through npm.");
    execFileSync(
      process.execPath,
      [
        npm,
        "ci",
        "--omit=dev",
        `--workspace=${workspace}`,
        "--no-audit",
        "--no-fund",
      ],
      { cwd: temporary, stdio: "inherit" },
    );
    fs.cpSync(path.join(temporary, "node_modules"), destination, {
      recursive: true,
      verbatimSymlinks: true,
    });
    for (const name of ["core", "gui"]) {
      fs.rmSync(path.join(destination, "@fileconverter", name), {
        recursive: true,
        force: true,
      });
    }
    // npm can place version-conflicting dependencies inside a workspace.
    const nested = path.join(temporary, workspace, "node_modules");
    if (workspace === "packages/core" && fs.existsSync(nested))
      fs.cpSync(nested, destination, {
        recursive: true,
        verbatimSymlinks: true,
      });
    if (workspace === "packages/gui") {
      const core = path.join(destination, "@fileconverter/core");
      fs.mkdirSync(core, { recursive: true });
      fs.cpSync(
        path.join(root, "packages/core/dist"),
        path.join(core, "dist"),
        { recursive: true },
      );
      fs.copyFileSync(
        path.join(root, "packages/core/package.json"),
        path.join(core, "package.json"),
      );
      const coreNested = path.join(temporary, "packages/core/node_modules");
      if (fs.existsSync(coreNested))
        fs.cpSync(coreNested, path.join(core, "node_modules"), {
          recursive: true,
          verbatimSymlinks: true,
        });
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

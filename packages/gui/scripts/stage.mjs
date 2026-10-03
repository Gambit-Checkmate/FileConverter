import { copyProductionModules } from "../../../scripts/locked-production.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const guiRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const stageRoot = path.join(guiRoot, ".stage");
const guiPackage = JSON.parse(
  fs.readFileSync(path.join(guiRoot, "package.json"), "utf8"),
);
fs.rmSync(stageRoot, { recursive: true, force: true });
fs.mkdirSync(stageRoot, { recursive: true });

for (const name of ["dist", "electron", "icons"]) {
  fs.cpSync(path.join(guiRoot, name), path.join(stageRoot, name), {
    recursive: true,
  });
}
fs.copyFileSync(
  path.join(guiRoot, "forge.config.cjs"),
  path.join(stageRoot, "forge.config.cjs"),
);

copyProductionModules(path.join(stageRoot, "node_modules"), "packages/gui");
fs.writeFileSync(
  path.join(stageRoot, "package.json"),
  JSON.stringify(
    {
      name: "fileconverter-desktop",
      productName: guiPackage.productName,
      version: guiPackage.version,
      main: "electron/main.cjs",
      dependencies: {
        "@fileconverter/core": guiPackage.dependencies["@fileconverter/core"],
        node: guiPackage.dependencies.node,
      },
      devDependencies: {
        electron: guiPackage.devDependencies.electron,
        "@electron-forge/cli":
          guiPackage.devDependencies["@electron-forge/cli"],
      },
    },
    null,
    2,
  ),
);

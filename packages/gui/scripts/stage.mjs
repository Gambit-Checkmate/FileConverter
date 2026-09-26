import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const guiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(guiRoot, '../..');
const coreRoot = path.resolve(guiRoot, '../core');
const stageRoot = path.join(guiRoot, '.stage');
const guiPackage = JSON.parse(fs.readFileSync(path.join(guiRoot, 'package.json'), 'utf8'));
const projectPackage = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const npmCli = process.env.npm_execpath;

if (!npmCli) {
  throw new Error('Run this script through npm so its CLI path is available.');
}

function runNpm(args, options) {
  return execFileSync(process.execPath, [npmCli, ...args], options);
}

fs.rmSync(stageRoot, { recursive: true, force: true });
fs.mkdirSync(stageRoot, { recursive: true });

for (const name of ['dist', 'electron', 'icons']) {
  fs.cpSync(path.join(guiRoot, name), path.join(stageRoot, name), { recursive: true });
}
fs.copyFileSync(path.join(guiRoot, 'forge.config.cjs'), path.join(stageRoot, 'forge.config.cjs'));

const packResult = JSON.parse(runNpm([
  'pack', coreRoot, '--ignore-scripts', '--pack-destination', stageRoot, '--json',
], { cwd: guiRoot, encoding: 'utf8' }));
const tarball = packResult[0].filename;

fs.writeFileSync(path.join(stageRoot, 'package.json'), JSON.stringify({
  name: 'fileconverter-desktop',
  productName: guiPackage.productName,
  version: projectPackage.version,
  main: 'electron/main.cjs',
  dependencies: {
    '@fileconverter/core': `file:./${tarball}`,
    node: '22.23.3',
  },
  devDependencies: {
    electron: guiPackage.devDependencies.electron,
    '@electron-forge/cli': guiPackage.devDependencies['@electron-forge/cli'],
  },
}, null, 2));

runNpm(['install', '--omit=dev', '--no-package-lock'], {
  cwd: stageRoot,
  stdio: 'inherit',
});

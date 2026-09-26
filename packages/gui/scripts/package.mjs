import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const action = process.argv[2];
if (!['package', 'make'].includes(action)) {
  throw new Error('Expected package or make.');
}
if (Number(process.versions.node.split('.')[0]) >= 26) {
  throw new Error('Electron Forge packaging requires Node.js 22 or 24. Use Node.js 22 LTS.');
}

const guiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forgeCli = createRequire(import.meta.url).resolve('@electron-forge/cli/dist/electron-forge.js');
const result = spawnSync(process.execPath, [forgeCli, action], {
  cwd: path.join(guiRoot, '.stage'),
  env: process.env,
  stdio: 'inherit',
});

if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status || 1;

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';

const guiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const electron = require('electron');
const server = await createServer({ root: guiRoot });
await server.listen();
const url = server.resolvedUrls.local[0];

const child = spawn(electron, ['.'], {
  cwd: guiRoot,
  stdio: 'inherit',
  env: { ...process.env, FILECONVERTER_GUI_DEV_URL: url },
});

child.on('exit', async (code) => {
  await server.close();
  process.exitCode = code ?? 1;
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));

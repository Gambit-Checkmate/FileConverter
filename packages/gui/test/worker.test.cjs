const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const workerPath = path.join(__dirname, '../electron/worker.cjs');
const sourceImage = path.join(__dirname, '../icons/icon.png');

function requestConversion(inputPaths, outputDir, format) {
  return new Promise((resolve, reject) => {
    const child = fork(workerPath, [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    let settled = false;
    child.on('message', (message) => {
      settled = true;
      if (message.ok) resolve(message.result);
      else reject(new Error(message.error));
      child.disconnect();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (!settled) reject(new Error(`Worker exited before returning a result: ${code}`));
    });
    child.send({ inputPaths, outputDir, format });
  });
}

test('the worker converts an image and reports an existing output without overwriting it', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fileconverter-gui-'));
  try {
    const inputPath = path.join(directory, 'icon.png');
    const outputDir = path.join(directory, 'output');
    fs.mkdirSync(outputDir);
    fs.copyFileSync(sourceImage, inputPath);

    const first = await requestConversion([inputPath], outputDir, 'jpg');
    assert.equal(first.success, true);
    assert.equal(first.jobs[0].status, 'completed');
    const outputPath = first.jobs[0].output_path;
    assert.ok(fs.statSync(outputPath).size > 0);

    const second = await requestConversion([inputPath], outputDir, 'jpg');
    assert.equal(second.success, false);
    assert.match(second.jobs[0].error, /already exists/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('the worker reports an unsupported format pair per file', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fileconverter-gui-'));
  try {
    const result = await requestConversion([sourceImage], directory, 'md');
    assert.equal(result.success, false);
    assert.match(result.jobs[0].error, /not supported/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

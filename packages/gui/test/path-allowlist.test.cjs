const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  PathAllowlist,
  assertSafeAbsolutePath,
  isAllowedRealPath,
  assertConvertRequest,
} = require('../electron/path-allowlist.cjs');

test('assertSafeAbsolutePath rejects relative and .. paths', () => {
  assert.throws(() => assertSafeAbsolutePath('relative/file.png'), /absolute/);
  assert.throws(() => assertSafeAbsolutePath(''), /non-empty/);
  assert.throws(() => assertSafeAbsolutePath(`..${path.sep}etc${path.sep}passwd`), /absolute/);
  // Build with literal ".." — path.join would collapse it away.
  const withDotDot = [path.sep + 'tmp', 'a', '..', 'b'].join(path.sep);
  assert.throws(() => assertSafeAbsolutePath(withDotDot), /\.\./);
});

test('allowlist remembers dialog paths and convert requires them', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-allow-'));
  try {
    const inputDir = path.join(root, 'in');
    const outputDir = path.join(root, 'out');
    fs.mkdirSync(inputDir);
    fs.mkdirSync(outputDir);
    const filePath = path.join(inputDir, 'a.txt');
    fs.writeFileSync(filePath, 'hi');

    const allowlist = new PathAllowlist();
    allowlist.remember([filePath, outputDir]);

    const ok = assertConvertRequest([filePath], outputDir, allowlist);
    assert.equal(ok.inputPaths.length, 1);
    assert.equal(ok.outputDir, fs.realpathSync(outputDir));

    const other = path.join(root, 'evil.txt');
    fs.writeFileSync(other, 'nope');
    assert.throws(
      () => assertConvertRequest([other], outputDir, allowlist),
      /not selected through the file dialog/
    );

    const otherOut = path.join(root, 'other-out');
    fs.mkdirSync(otherOut);
    assert.throws(
      () => assertConvertRequest([filePath], otherOut, allowlist),
      /not selected through the file dialog/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('files under a remembered folder are allowed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-allow-folder-'));
  try {
    const folder = path.join(root, 'picked');
    fs.mkdirSync(folder);
    const nested = path.join(folder, 'nested');
    fs.mkdirSync(nested);
    const filePath = path.join(nested, 'doc.md');
    fs.writeFileSync(filePath, '# hi');
    const outputDir = path.join(folder, 'exports');
    fs.mkdirSync(outputDir);

    const allowlist = new PathAllowlist();
    allowlist.remember([folder]);

    const ok = assertConvertRequest([filePath], outputDir, allowlist);
    assert.equal(ok.inputPaths[0], fs.realpathSync(filePath));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('symlink escape out of allowlisted tree is rejected', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-allow-link-'));
  try {
    const allowed = path.join(root, 'allowed');
    const outside = path.join(root, 'outside');
    fs.mkdirSync(allowed);
    fs.mkdirSync(outside);
    const secret = path.join(outside, 'secret.txt');
    fs.writeFileSync(secret, 'secret');
    const linkInside = path.join(allowed, 'escape.txt');
    try {
      fs.symlinkSync(secret, linkInside);
    } catch (error) {
      // Some CI images disallow symlinks — skip
      if (error && (error.code === 'EPERM' || error.code === 'EACCES')) return;
      throw error;
    }

    const allowlist = new PathAllowlist();
    allowlist.remember([allowed]);

    // realpath of link resolves outside allowed → reject
    assert.throws(
      () => assertConvertRequest([linkInside], allowed, allowlist),
      /not selected through the file dialog/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('clear empties the session allowlist', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-allow-clear-'));
  try {
    const filePath = path.join(root, 'a.txt');
    fs.writeFileSync(filePath, 'x');
    const allowlist = new PathAllowlist();
    allowlist.remember([filePath]);
    assert.equal(allowlist.size(), 1);
    allowlist.clear();
    assert.equal(allowlist.size(), 0);
    assert.throws(
      () => assertConvertRequest([filePath], root, allowlist),
      /not selected through the file dialog/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('isAllowedRealPath exact and child matches', () => {
  const base = path.join(path.sep, 'tmp', 'allow');
  assert.equal(isAllowedRealPath(base, [base]), true);
  assert.equal(isAllowedRealPath(path.join(base, 'child'), [base]), true);
  assert.equal(isAllowedRealPath(path.join(path.sep, 'tmp', 'other'), [base]), false);
  // Prefix attack: /tmp/allow-evil should not match /tmp/allow
  assert.equal(isAllowedRealPath(base + '-evil', [base]), false);
});

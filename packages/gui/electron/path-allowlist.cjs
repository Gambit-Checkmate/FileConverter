'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Session-scoped allowlist of dialog-selected paths (files and directories).
 * Paths are stored as realpath results so symlink escapes fail the compare.
 */
class PathAllowlist {
  constructor() {
    /** @type {Set<string>} */
    this._entries = new Set();
  }

  clear() {
    this._entries.clear();
  }

  size() {
    return this._entries.size;
  }

  /**
   * Remember dialog-selected paths. Missing paths are skipped.
   * @param {string[]} filePaths
   */
  remember(filePaths) {
    if (!Array.isArray(filePaths)) return;
    for (const filePath of filePaths) {
      if (typeof filePath !== 'string' || filePath.length === 0) continue;
      try {
        this._entries.add(fs.realpathSync(filePath));
      } catch {
        // Dialog can race with delete; skip unreadable paths.
      }
    }
  }

  /**
   * @returns {string[]}
   */
  snapshot() {
    return Array.from(this._entries);
  }
}

/**
 * Reject relative paths, empty strings, and any candidate whose normalized
 * form still contains `..` segments (before realpath).
 * @param {string} candidate
 * @returns {string} absolute normalized path
 */
function assertSafeAbsolutePath(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new Error('Path must be a non-empty string.');
  }
  if (candidate.includes('\0')) {
    throw new Error('Path must not contain null bytes.');
  }
  if (!path.isAbsolute(candidate)) {
    throw new Error(`Path must be absolute: ${candidate}`);
  }
  // Reject ".." in the raw path before normalize collapses escapes.
  const rawParts = candidate.split(/[\\/]/);
  if (rawParts.includes('..')) {
    throw new Error(`Path must not contain '..': ${candidate}`);
  }
  const normalized = path.normalize(candidate);
  if (!path.isAbsolute(normalized)) {
    throw new Error(`Path must be absolute after normalize: ${candidate}`);
  }
  return normalized;
}
function isAllowedRealPath(realPath, allowedReals) {
  for (const allowed of allowedReals) {
    if (realPath === allowed) return true;
    const prefix = allowed.endsWith(path.sep) ? allowed : allowed + path.sep;
    if (realPath.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Resolve to realpath and require membership in the allowlist.
 * Fail closed: any failure throws before fork.
 * @param {string} candidate
 * @param {PathAllowlist} allowlist
 * @returns {string} realpath
 */
function assertAllowedExistingPath(candidate, allowlist) {
  const absolute = assertSafeAbsolutePath(candidate);
  let real;
  try {
    real = fs.realpathSync(absolute);
  } catch {
    throw new Error(`Path does not exist or cannot be resolved: ${candidate}`);
  }
  if (!isAllowedRealPath(real, allowlist.snapshot())) {
    throw new Error('Path was not selected through the file dialog in this session.');
  }
  return real;
}

/**
 * Validate convert inputs + outputDir against the session allowlist.
 * Rejects the whole request if any path fails (no partial fork).
 * @param {unknown} inputPaths
 * @param {unknown} outputDir
 * @param {PathAllowlist} allowlist
 * @returns {{ inputPaths: string[], outputDir: string }}
 */
function assertConvertRequest(inputPaths, outputDir, allowlist) {
  if (!Array.isArray(inputPaths) || inputPaths.length === 0) {
    throw new Error('At least one input path is required.');
  }
  if (typeof outputDir !== 'string') {
    throw new Error('Output directory must be a string.');
  }

  const resolvedInputs = [];
  for (const inputPath of inputPaths) {
    const real = assertAllowedExistingPath(inputPath, allowlist);
    const stat = fs.statSync(real);
    if (!stat.isFile()) {
      throw new Error(`Input must be a file: ${inputPath}`);
    }
    resolvedInputs.push(real);
  }

  const realOutput = assertAllowedExistingPath(outputDir, allowlist);
  const outStat = fs.statSync(realOutput);
  if (!outStat.isDirectory()) {
    throw new Error(`Output must be a directory: ${outputDir}`);
  }

  return { inputPaths: resolvedInputs, outputDir: realOutput };
}

module.exports = {
  PathAllowlist,
  assertSafeAbsolutePath,
  isAllowedRealPath,
  assertAllowedExistingPath,
  assertConvertRequest,
};

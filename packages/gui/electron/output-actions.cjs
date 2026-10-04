"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { assertSafeAbsolutePath } = require("./path-allowlist.cjs");

function rememberCompletedOutputs(result, outputDir, approved) {
  const root = fs.realpathSync(outputDir);
  for (const job of result.jobs || []) {
    if (job.status !== "completed") continue;
    for (const candidate of job.output_paths || [job.output_path]) {
      try {
        const real = fs.realpathSync(assertSafeAbsolutePath(candidate));
        const relative = path.relative(root, real);
        if (
          relative &&
          relative !== ".." &&
          !relative.startsWith(`..${path.sep}`) &&
          !path.isAbsolute(relative) &&
          fs.statSync(real).isFile()
        )
          approved.add(real);
      } catch {
        // A deleted output must not become an approved path.
      }
    }
  }
}

function assertCompletedOutput(candidate, approved) {
  const safe = assertSafeAbsolutePath(candidate);
  let real;
  try {
    real = fs.realpathSync(safe);
    if (!fs.statSync(real).isFile()) throw new Error("Not a file.");
  } catch {
    throw new Error("The output file no longer exists.");
  }
  if (!approved.has(real)) {
    throw new Error(
      "The file is not a completed conversion from this session.",
    );
  }
  return real;
}

module.exports = { rememberCompletedOutputs, assertCompletedOutput };

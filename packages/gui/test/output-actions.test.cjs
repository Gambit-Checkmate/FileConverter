const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  rememberCompletedOutputs,
  assertCompletedOutput,
} = require("../electron/output-actions.cjs");

test("only completed files in the selected destination can be opened", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fileconverter-results-"));
  try {
    const outputDir = path.join(root, "out");
    fs.mkdirSync(outputDir);
    const first = path.join(outputDir, "first.png");
    const second = path.join(outputDir, "second.png");
    const failed = path.join(outputDir, "failed.png");
    const outside = path.join(root, "outside.png");
    for (const file of [first, second, failed, outside])
      fs.writeFileSync(file, "fixture");
    const approved = new Set();
    rememberCompletedOutputs(
      {
        jobs: [
          { status: "completed", output_paths: [first, second] },
          { status: "failed", output_path: failed },
          { status: "completed", output_path: outside },
        ],
      },
      outputDir,
      approved,
    );

    assert.equal(
      assertCompletedOutput(first, approved),
      fs.realpathSync(first),
    );
    assert.equal(
      assertCompletedOutput(second, approved),
      fs.realpathSync(second),
    );
    assert.throws(
      () => assertCompletedOutput(failed, approved),
      /not a completed conversion/,
    );
    assert.throws(
      () => assertCompletedOutput(outside, approved),
      /not a completed conversion/,
    );
    assert.throws(
      () => assertCompletedOutput("first.png", approved),
      /absolute/,
    );

    fs.unlinkSync(first);
    assert.throws(
      () => assertCompletedOutput(first, approved),
      /no longer exists/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildPlans, convertFiles } = require("../electron/worker.cjs");

for (const extension of ["gif", "webp"]) {
  test(`animated ${extension} warns in preview and direct conversion without failing`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "animation-warning-"));
    try {
      const input = path.join(
        __dirname,
        `../../core/test/fixtures/animated.${extension}`,
      );
      const output = path.join(root, "output");
      const [plan] = await buildPlans([input], output, "png");
      assert.equal(plan.supported, true);
      assert.equal(plan.reason, undefined);
      assert.match(plan.warning, /first frame/);
      assert.equal(fs.existsSync(output), false);

      // Convert directly, without supplying a preview, as the UI allows.
      const result = await convertFiles([input], output, "png");
      assert.equal(result.success, true);
      assert.equal(result.jobs[0].status, "completed");
      assert.equal(result.jobs[0].warning, plan.warning);
      assert.equal(result.jobs[0].error, undefined);
      assert.ok(fs.statSync(result.jobs[0].output_path).size > 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

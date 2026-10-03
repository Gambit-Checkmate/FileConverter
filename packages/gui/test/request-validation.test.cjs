const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PathAllowlist } = require("../electron/path-allowlist.cjs");
const { validateRequest } = require("../electron/request-validation.cjs");
test("all worker endpoints preserve dialog access controls, including folder input and saved output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fc-request-"));
  try {
    const selected = path.join(root, "selected");
    fs.mkdirSync(selected);
    const outside = path.join(root, "outside");
    fs.mkdirSync(outside);
    const input = path.join(selected, "source.txt");
    fs.writeFileSync(input, "hello");
    const forbidden = path.join(outside, "secret.txt");
    fs.writeFileSync(forbidden, "secret");
    const allowlist = new PathAllowlist();
    allowlist.remember([selected]);
    const normal = {
      inputPaths: [input],
      outputDir: selected,
      format: "html",
      options: {},
    };
    for (const action of ["convert", "preview", "inputs:inspect"]) {
      assert.equal(
        validateRequest(action, normal, allowlist).inputPaths[0],
        fs.realpathSync(input),
      );
      assert.throws(
        () =>
          validateRequest(
            action,
            { ...normal, inputPaths: [forbidden] },
            allowlist,
          ),
        /not selected/,
      );
    }
    assert.equal(
      validateRequest(
        "convert",
        { ...normal, inputPaths: [selected] },
        allowlist,
      ).inputPaths[0],
      fs.realpathSync(selected),
    );
    assert.throws(
      () =>
        validateRequest(
          "preview",
          { ...normal, options: { projectDirectory: outside } },
          allowlist,
        ),
      /not selected/,
    );
    for (const action of ["presets:list", "presets:create", "presets:delete"])
      assert.throws(
        () => validateRequest(action, { projectDirectory: outside }, allowlist),
        /not selected/,
      );
    assert.throws(
      () =>
        validateRequest(
          "convert",
          { ...normal, options: { inputFiles: [forbidden] } },
          allowlist,
        ),
      /Invalid conversion options/,
    );
    const output = path.join(fs.realpathSync(outside), "chosen.html");
    assert.throws(
      () =>
        validateRequest(
          "convert",
          { ...normal, outputDir: outside, options: { outputFile: output } },
          allowlist,
        ),
      /save dialog/,
    );
    const saved = new Set([output]);
    assert.equal(
      validateRequest(
        "convert",
        { ...normal, outputDir: outside, options: { outputFile: output } },
        allowlist,
        saved,
      ).outputDir,
      fs.realpathSync(outside),
    );
    assert.throws(
      () =>
        validateRequest(
          "convert",
          {
            ...normal,
            outputDir: outside,
            options: { outputFile: path.join(outside, "other.html") },
          },
          allowlist,
          saved,
        ),
      /save dialog/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

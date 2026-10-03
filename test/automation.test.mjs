import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { affected } from "../scripts/ci-changes.mjs";
import { selectRun } from "../scripts/release-ci.mjs";
import { verify } from "../scripts/artifacts.mjs";
test("GUI changes do not run CLI jobs, engine changes also validate its GUI consumer", () => {
  assert.deepEqual(affected(["packages/gui/src/App.tsx"]), {
    core: false,
    gui: true,
  });
  assert.deepEqual(affected(["packages/core/src/cli.ts"]), {
    core: true,
    gui: true,
  });
  assert.deepEqual(affected(["package-lock.json"]), { core: true, gui: true });
  assert.deepEqual(affected(["README.md"]), { core: false, gui: false });
  assert.deepEqual(affected(["packages/gui/README.md"]), {
    core: false,
    gui: false,
  });
  assert.deepEqual(affected([".npmrc"]), { core: true, gui: true });
  assert.deepEqual(affected([".release-please-manifest.json"]), {
    core: true,
    gui: true,
  });
  assert.deepEqual(affected([".github/workflows/release.yml"]), {
    core: true,
    gui: true,
  });
});
test("promotion rejects wrong commit/version/product, tampering, and unrecorded files", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-test-"));
  try {
    const name = "desktop.zip",
      sha = "a".repeat(40),
      data = "tested binary";
    fs.writeFileSync(path.join(directory, name), data);
    const metadata = {
      product: "gui",
      platform: "linux-x64",
      version: "2.1.0",
      sha,
      files: [
        { name, sha256: createHash("sha256").update(data).digest("hex") },
      ],
    };
    fs.writeFileSync(
      path.join(directory, "metadata.json"),
      JSON.stringify(metadata),
    );
    assert.equal(verify(directory, "gui", "2.1.0", sha).files.length, 1);
    assert.throws(() => verify(directory, "gui", "2.1.0", "b".repeat(40)));
    assert.throws(() => verify(directory, "gui", "2.2.0", sha));
    assert.throws(() => verify(directory, "cli", "2.1.0", sha));
    fs.writeFileSync(path.join(directory, "extra.zip"), data);
    assert.throws(() => verify(directory, "gui", "2.1.0", sha));
    fs.unlinkSync(path.join(directory, "extra.zip"));
    fs.writeFileSync(path.join(directory, name), "tampered");
    assert.throws(() => verify(directory, "gui", "2.1.0", sha));
    metadata.files[0].name = "../secret";
    fs.writeFileSync(
      path.join(directory, "metadata.json"),
      JSON.stringify(metadata),
    );
    assert.throws(() => verify(directory, "gui", "2.1.0", sha));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("publication follows the tag commit CI even when main has advanced", () => {
  const sha = "a".repeat(40);
  const success = {
    databaseId: 1,
    headSha: sha,
    event: "push",
    headBranch: "main",
    status: "completed",
    conclusion: "success",
  };
  const newer = { ...success, databaseId: 2, headSha: "b".repeat(40) };
  assert.equal(selectRun([newer, success], sha).databaseId, 1);
  const live = { ...success, status: "in_progress", conclusion: "" };
  assert.equal(selectRun([newer, live], sha).databaseId, 1);
  assert.throws(() => selectRun([newer], sha));
  assert.throws(() => selectRun([{ ...success, conclusion: "failure" }], sha));
  assert.throws(() => selectRun([{ ...success, event: "pull_request" }], sha));
  assert.throws(() =>
    selectRun([{ ...success, headBranch: "untrusted" }], sha),
  );
});

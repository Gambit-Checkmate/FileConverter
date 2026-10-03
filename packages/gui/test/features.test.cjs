const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");
const { AdapterManager, Converter } = require("@fileconverter/core");
const {
  buildPlans,
  convertFiles,
  handleRequest,
} = require("../electron/worker.cjs");
async function fixture(work) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "fileconverter-features-"),
  );
  try {
    await work(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
async function image(filename) {
  await sharp({
    create: { width: 200, height: 100, channels: 3, background: "#f00" },
  })
    .withMetadata()
    .png()
    .toFile(filename);
}
test("preview is read-only, recursive scans skip output and symlinks, and collisions are rejected", () =>
  fixture(async (root) => {
    const nested = path.join(root, "nested");
    fs.mkdirSync(nested);
    const output = path.join(root, "out");
    fs.mkdirSync(output);
    await image(path.join(root, "a.png"));
    await image(path.join(nested, "a.png"));
    await image(path.join(output, "old.png"));
    fs.symlinkSync(
      root,
      path.join(nested, "cycle"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const shallow = await buildPlans([root], output, "jpg");
    assert.equal(shallow.length, 1);
    const recursive = await buildPlans([root], output, "jpg", {
      recursive: true,
    });
    assert.equal(recursive.length, 2);
    assert.ok(
      recursive.every(
        (plan) => !plan.supported && /same output/.test(plan.reason),
      ),
    );
    const missingOutput = path.join(root, "does-not-exist");
    const preview = await buildPlans(
      [path.join(root, "a.png")],
      missingOutput,
      "jpg",
    );
    assert.equal(preview[0].supported, true);
    assert.equal(fs.existsSync(missingOutput), false);
  }));
test("image settings and presets affect output; explicit fields override presets and metadata is removed", () =>
  fixture(async (root) => {
    const input = path.join(root, "source.png");
    await image(input);
    await handleRequest("presets:create", {
      projectDirectory: root,
      scope: "local",
      name: "small",
      description: "Small image",
      type: "image",
      parameters: "quality=80;maxWidth=60;stripMetadata=true",
    });
    const presets = await handleRequest("presets:list", {
      projectDirectory: root,
    });
    assert.ok(presets.some((p) => p.name === "small" && p.scope === "local"));
    const result = await convertFiles(
      [input],
      path.join(root, "output"),
      "jpg",
      {
        projectDirectory: root,
        preset: "small",
        presetScope: "local",
        maxWidth: 40,
      },
    );
    assert.equal(result.success, true);
    const metadata = await sharp(result.jobs[0].output_path).metadata();
    assert.equal(metadata.width, 40);
    assert.equal(metadata.height, 20);
    assert.equal(metadata.exif, undefined);
    assert.ok(
      !fs
        .readdirSync(path.join(root, "output"))
        .some((p) => p.startsWith(".fileconverter-")),
    );
    assert.equal(
      await handleRequest("presets:delete", {
        projectDirectory: root,
        scope: "local",
        name: "small",
      }),
      true,
    );
    await assert.rejects(
      handleRequest("presets:delete", {
        projectDirectory: root,
        scope: "global",
        name: "image/web",
      }),
      /read-only/,
    );
    await assert.rejects(
      buildPlans([input], root, "jpg", { quality: 101 }),
      /Quality/,
    );
  }));
test("PDF merge preserves order, extraction validates ranges, and optimization remains readable", () =>
  fixture(async (root) => {
    const inputs = [];
    for (const width of [100, 200]) {
      const pdf = await PDFDocument.create();
      pdf.addPage([width, 300]);
      const filename = path.join(root, `${width}.pdf`);
      fs.writeFileSync(filename, await pdf.save());
      inputs.push(filename);
    }
    const outputFile = path.join(root, "merged.pdf");
    const merged = await convertFiles(inputs.reverse(), root, "pdf", {
      operation: "merge",
      outputFile,
    });
    assert.equal(merged.success, true);
    const document = await PDFDocument.load(fs.readFileSync(outputFile));
    assert.deepEqual(
      document.getPages().map((page) => page.getWidth()),
      [200, 100],
    );
    const extracted = path.join(root, "extracted.pdf");
    assert.equal(
      (
        await convertFiles([outputFile], root, "pdf", {
          operation: "split",
          pages: "2",
          outputFile: extracted,
        })
      ).success,
      true,
    );
    assert.equal(
      (await PDFDocument.load(fs.readFileSync(extracted))).getPageCount(),
      1,
    );
    const invalid = await convertFiles([outputFile], root, "pdf", {
      operation: "split",
      pages: "1junk",
      outputFile: path.join(root, "invalid.pdf"),
      retries: 0,
    });
    assert.equal(invalid.success, false);
    assert.match(invalid.jobs[0].error, /Invalid page range/);
    const optimized = path.join(root, "optimized.pdf");
    assert.equal(
      (
        await convertFiles([outputFile], root, "pdf", {
          operation: "compress",
          outputFile: optimized,
        })
      ).success,
      true,
    );
    assert.equal(
      (await PDFDocument.load(fs.readFileSync(optimized))).getPageCount(),
      2,
    );
  }));
test("queue limits parallel work, retries transient failures, and reports every input", () =>
  fixture(async (root) => {
    const inputs = [];
    for (let index = 0; index < 3; index++) {
      const filename = path.join(root, `${index}.png`);
      await image(filename);
      inputs.push(filename);
    }
    const original = AdapterManager.prototype.convert;
    let active = 0,
      maximum = 0;
    const attempts = new Map();
    AdapterManager.prototype.convert = async function (plan) {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 30));
      active--;
      const count = (attempts.get(plan.inputPath) || 0) + 1;
      attempts.set(plan.inputPath, count);
      if (count === 1)
        return {
          success: false,
          error: "Temporary failure",
          outputPath: plan.outputPath,
          duration: 30,
        };
      fs.writeFileSync(plan.outputPath, "converted");
      return { success: true, outputPath: plan.outputPath, duration: 30 };
    };
    try {
      const result = await convertFiles(inputs, path.join(root, "out"), "jpg", {
        concurrency: 2,
        retries: 1,
      });
      assert.equal(maximum, 2);
      assert.equal(result.successfulJobs, 3);
      assert.equal(result.jobs.length, 3);
      assert.ok(result.jobs.every((job) => job.retryCount === 1));
      assert.equal(result.logs.length, 6);
      attempts.clear();
      const noRetries = await convertFiles(
        [inputs[0]],
        path.join(root, "no-retries"),
        "webp",
        { retries: 0 },
      );
      assert.equal(noRetries.failedJobs, 1);
      assert.equal(attempts.get(inputs[0]), 1);
      assert.equal(noRetries.jobs[0].retryCount, 0);

      const failed = await convertFiles(
        [inputs[0]],
        path.join(root, "fail"),
        "md",
        { retries: 0 },
      );
      assert.equal(failed.failedJobs, 1);
      assert.equal(failed.logs.length, 1);
    } finally {
      AdapterManager.prototype.convert = original;
    }
  }));
test("publication never overwrites a destination created during conversion", () =>
  fixture(async (root) => {
    const input = path.join(root, "source.png");
    await image(input);
    const output = path.join(root, "output");
    const original = AdapterManager.prototype.convert;
    AdapterManager.prototype.convert = async function (plan, parameters) {
      const result = await original.call(this, plan, parameters);
      fs.writeFileSync(path.join(output, "source.jpg"), "other writer");
      return result;
    };
    try {
      const result = await convertFiles([input], output, "jpg");
      assert.equal(result.success, false);
      assert.equal(
        fs.readFileSync(path.join(output, "source.jpg"), "utf8"),
        "other writer",
      );
    } finally {
      AdapterManager.prototype.convert = original;
    }
  }));
test("OCR language reaches the adapter through resolved conversion settings", () =>
  fixture(async (root) => {
    const input = path.join(root, "source.png");
    await image(input);
    const original = AdapterManager.prototype.convert;
    let language;
    AdapterManager.prototype.convert = async function (plan, parameters) {
      language = parameters.language;
      fs.writeFileSync(plan.outputPath, "Recognized text");
      return { success: true, outputPath: plan.outputPath, duration: 0 };
    };
    try {
      const result = await convertFiles([input], root, "txt", {
        language: "nno",
        outputFile: path.join(root, "recognized.txt"),
      });
      assert.equal(language, "nno");
      assert.equal(result.success, true);
      const settings = await new Converter().resolveParameters({
        input,
        output: root,
        format: "txt",
        language: "nor",
        projectDirectory: root,
      });
      assert.equal(settings.language, "nor");
    } finally {
      AdapterManager.prototype.convert = original;
    }
  }));

test("format inspection reports mixed inputs and includes the JPEG alias", () =>
  fixture(async (root) => {
    const png = path.join(root, "source.png");
    await image(png);
    const markdown = path.join(root, "source.md");
    fs.writeFileSync(markdown, "# Heading");
    const inputs = await handleRequest("inputs:inspect", {
      inputPaths: [png, markdown],
    });
    assert.deepEqual(
      inputs.map((input) => input.inputFormat),
      ["png", "md"],
    );
    const info = await handleRequest("info", {});
    assert.ok(
      info.conversions.some(
        (pair) => pair.inputFormat === "png" && pair.outputFormat === "jpeg",
      ),
    );
    assert.ok(
      info.conversions.some(
        (pair) =>
          pair.inputFormat === "pdf" &&
          pair.outputFormat === "pdf" &&
          pair.requiresOperation,
      ),
    );
  }));

test("unsupported inputs do not block a supported input with the same basename", () =>
  fixture(async (root) => {
    const png = path.join(root, "source.png");
    await image(png);
    const markdown = path.join(root, "source.md");
    fs.writeFileSync(markdown, "# Heading");
    const result = await convertFiles(
      [png, markdown],
      path.join(root, "out"),
      "jpg",
    );
    assert.equal(result.successfulJobs, 1);
    assert.equal(result.failedJobs, 1);
    assert.match(result.jobs[1].error, /not supported/);
  }));

test("global presets persist independently of project presets", () =>
  fixture(async (root) => {
    const original = os.homedir;
    os.homedir = () => root;
    try {
      await handleRequest("presets:create", {
        scope: "global",
        name: "global-small",
        description: "Shared preset",
        type: "image",
        parameters: "maxWidth=20",
      });
      assert.ok(
        (await handleRequest("presets:list", {})).some(
          (preset) =>
            preset.name === "global-small" && preset.scope === "global",
        ),
      );
      assert.ok(
        fs.existsSync(path.join(root, ".fileconverter", "presets.json")),
      );
      assert.equal(
        await handleRequest("presets:delete", {
          scope: "global",
          name: "global-small",
        }),
        true,
      );
    } finally {
      os.homedir = original;
    }
  }));

test("filesystems without hard links use exclusive copies", () =>
  fixture(async (root) => {
    const input = path.join(root, "source.png");
    await image(input);
    const original = fs.linkSync;
    fs.linkSync = () => {
      const error = new Error("Hard links unsupported");
      error.code = "ENOTSUP";
      throw error;
    };
    try {
      const result = await convertFiles([input], path.join(root, "out"), "jpg");
      assert.equal(result.success, true);
      assert.equal(
        (await sharp(result.jobs[0].output_path).metadata()).format,
        "jpeg",
      );
      const repeated = await convertFiles(
        [input],
        path.join(root, "out"),
        "jpg",
      );
      assert.equal(repeated.success, false);
      assert.match(repeated.jobs[0].error, /already exists/);
    } finally {
      fs.linkSync = original;
    }
  }));

test("multi-page PDF rasterization previews and publishes every page without overwrites", () =>
  fixture(async (root) => {
    const pdf = await PDFDocument.create();
    pdf.addPage([72, 72]);
    pdf.addPage([144, 72]);
    const input = path.join(root, "pages.pdf");
    fs.writeFileSync(input, await pdf.save());
    const output = path.join(root, "out");
    const plans = await buildPlans([input], output, "png", { dpi: 72 });
    assert.deepEqual(
      plans[0].outputPaths.map((p) => path.basename(p)),
      ["pages-page-1.png", "pages-page-2.png"],
    );
    const result = await convertFiles([input], output, "png", {
      dpi: 72,
      retries: 0,
    });
    assert.equal(result.success, true, result.jobs[0].error);
    assert.equal(result.jobs[0].output_paths.length, 2);
    assert.equal(
      (await sharp(result.jobs[0].output_paths[1]).metadata()).width,
      144,
    );
    const repeat = await buildPlans([input], output, "png");
    assert.equal(repeat[0].supported, false);
    assert.match(repeat[0].reason, /already exists/);
  }));

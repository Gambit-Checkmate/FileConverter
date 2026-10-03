import { vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import Tesseract from "tesseract.js";
import { Converter } from "../../src/converter";
import { ConfigManager } from "../../src/config/config-manager";

vi.mock("tesseract.js", () => ({
  default: {
    createWorker: vi.fn(async () => ({
      recognize: async () => ({
        data: { text: "Recognized Norwegian text", confidence: 99 },
      }),
      terminate: async () => {},
    })),
  },
}));

describe("GUI parity core contracts", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "fileconverter-core-parity-"));
    vi.clearAllMocks();
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("forwards the selected OCR language through Converter and the real OCR adapter", async () => {
    const input = path.join(root, "source.png");
    await sharp({
      create: { width: 20, height: 20, channels: 3, background: "white" },
    })
      .png()
      .toFile(input);
    const result = await new Converter().convert({
      input,
      output: path.join(root, "out"),
      format: "txt",
      language: "nno",
      quiet: true,
      retries: 0,
      projectDirectory: root,
    });
    expect(Tesseract.createWorker).toHaveBeenCalledWith("nno");
    expect(result.successfulJobs).toBe(1);
    expect(fs.readFileSync(result.jobs[0].plan.outputPath, "utf8")).toBe(
      "Recognized Norwegian text",
    );
  });

  it("returns structured dry-run plans without creating the destination", async () => {
    const input = path.join(root, "source.md");
    fs.writeFileSync(input, "# Preview");
    const output = path.join(root, "new", "output");
    const result = await new Converter().convert({
      input,
      output,
      format: "html",
      dryRun: true,
      quiet: true,
    });
    expect(result.plans).toHaveLength(1);
    expect(result.plans?.[0].supported).toBe(true);
    expect(fs.existsSync(path.join(root, "new"))).toBe(false);
  });

  it("converts nested inputs and excludes an output folder inside the source", async () => {
    fs.mkdirSync(path.join(root, "nested"));
    fs.mkdirSync(path.join(root, "out"));
    fs.writeFileSync(path.join(root, "top.md"), "# Top");
    fs.writeFileSync(path.join(root, "nested", "child.md"), "# Child");
    fs.writeFileSync(path.join(root, "out", "old.md"), "# Excluded");
    const result = await new Converter().convert({
      input: root,
      output: path.join(root, "out"),
      format: "html",
      recursive: true,
      quiet: true,
      projectDirectory: root,
    });
    expect(result.successfulJobs).toBe(2);
    expect(fs.existsSync(path.join(root, "out", "child.html"))).toBe(true);
    expect(fs.existsSync(path.join(root, "out", "old.html"))).toBe(false);
  });

  it("resolves preset defaults without undefined overrides and isolates local config", async () => {
    const manager = ConfigManager.forProject(root);
    await manager.createPreset(
      "custom",
      "Local image preset",
      "image",
      { maxWidth: 60, stripMetadata: true },
      "local",
    );
    expect(
      (await ConfigManager.forProject(root).listPresets()).some(
        (p) => p.name === "custom",
      ),
    ).toBe(true);
    expect(
      (await ConfigManager.forProject(root, false).listPresets()).some(
        (p) => p.name === "custom",
      ),
    ).toBe(false);
    const parameters = await new Converter().resolveParameters({
      input: root,
      output: root,
      format: "jpg",
      projectDirectory: root,
      preset: "custom",
      maxWidth: undefined,
      stripMetadata: false,
    });
    expect(parameters.maxWidth).toBe(60);
    expect(parameters.stripMetadata).toBe(false);
  });
});

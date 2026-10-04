import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import JSZip from "jszip";
import sharp from "sharp";
import { DOMParser } from "@xmldom/xmldom";
import mammoth from "mammoth";
import PDFKit from "pdfkit";
import { PdfAdapter } from "../../src/adapters/pdf/pdf-adapter";
import { AdapterManager } from "../../src/adapters/adapter-manager";

describe("PDF → DOCX reconstruction", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-docx-test-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function convert(pdf: PDFDocument, options = {}) {
    const inputPath = path.join(dir, "input.pdf"),
      outputPath = path.join(dir, "output.docx");
    fs.writeFileSync(inputPath, await pdf.save());
    return new PdfAdapter().convert(
      {
        inputPath,
        outputPath,
        inputFormat: "pdf",
        outputFormat: "docx",
        supported: true,
      },
      options,
    );
  }
  async function documentXml() {
    const zip = await JSZip.loadAsync(
      fs.readFileSync(path.join(dir, "output.docx")),
    );
    const source = await zip.file("word/document.xml")!.async("string");
    const errors: string[] = [];
    const doc = new DOMParser({
      errorHandler: (level, message) => errors.push(`${level}: ${message}`),
    }).parseFromString(source, "application/xml");
    expect(errors).toEqual([]);
    return { zip, source, doc };
  }

  it("routes PDF → DOCX through the shared adapter registry used by CLI and GUI", () => {
    const manager = new AdapterManager();
    expect(manager.getAdapter("pdf", "docx")?.name).toBe("pdf");
    expect(manager.getSupportedConversions()).toContainEqual({
      inputFormat: "pdf",
      outputFormat: "docx",
      adapter: "pdf",
    });
    expect(manager.getAdapter("pdf", "doc")).toBeNull();
  });

  it("creates editable text, native 2×2 table, graphic background, colors and page dimensions", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const page = pdf.addPage([300, 300]);
    page.drawText("Heading & details", {
      x: 20,
      y: 265,
      size: 16,
      font,
      color: rgb(1, 0, 0),
    });
    for (const x of [30, 130, 230])
      page.drawLine({ start: { x, y: 90 }, end: { x, y: 190 }, thickness: 1 });
    for (const y of [90, 140, 190])
      page.drawLine({ start: { x: 30, y }, end: { x: 230, y }, thickness: 1 });
    for (const [text, x, y] of [
      ["A1", 40, 170],
      ["B1", 140, 170],
      ["A2", 40, 120],
      ["B2", 140, 120],
    ] as const)
      page.drawText(text, { x, y, size: 12, font });
    const pixels = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#0000ff" },
    })
      .png()
      .toBuffer();
    page.drawImage(await pdf.embedPng(pixels), {
      x: 250,
      y: 20,
      width: 20,
      height: 20,
    });
    const result = await convert(pdf, { dpi: 72 });
    expect(result.success, result.error).toBe(true);
    const { zip, source, doc } = await documentXml();
    expect(doc.getElementsByTagName("w:tbl").length).toBe(1);
    expect(doc.getElementsByTagName("w:tr").length).toBe(2);
    expect(doc.getElementsByTagName("w:tc").length).toBe(4);
    expect(source).toContain("Heading &amp; details");
    expect(source).toContain("<w:b/>");
    expect(source).toContain('w:val="FF0000"');
    expect(source).toContain('w:w="6000" w:h="6000"');
    expect(result.metadata?.warning).toContain("1 editable ruled table");
    const image = await zip.file("word/media/page-1.png")!.async("nodebuffer");
    const { data, info } = await sharp(image)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) =>
      Array.from(
        data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3),
      );
    expect(pixel(260, 270)).toEqual([0, 0, 255]);
    // The heading is absent from the background, so the DOCX contains only one visible copy.
    const heading = await sharp(
      await sharp(image)
        .extract({ left: 15, top: 15, width: 230, height: 30 })
        .toBuffer(),
    ).stats();
    expect(heading.channels.map((channel) => channel.min)).toEqual([
      255, 255, 255, 255,
    ]);
    const html = (await mammoth.convertToHtml({ path: result.outputPath }))
      .value;
    expect(html).toContain("<table>");
    expect(html).toContain("A1");
    expect(html).toContain("Heading &amp; details");
  });

  it("keeps mixed page sizes, selection and page ordering", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 300]).drawText("First");
    pdf.addPage([400, 200]).drawText("Second");
    pdf.addPage([250, 250]).drawText("Third");
    const result = await convert(pdf, { pages: "1,3", dpi: 72 });
    expect(result.success, result.error).toBe(true);
    const { zip, source, doc } = await documentXml();
    expect(doc.getElementsByTagName("w:sectPr").length).toBe(2);
    expect(source).toContain('w:w="4000" w:h="6000"');
    expect(source).toContain('w:w="5000" w:h="5000"');
    expect(source).toContain("First");
    expect(source).toContain("Third");
    expect(source).not.toContain("Second");
    expect(zip.file("word/media/page-2.png")).not.toBeNull();
    expect(zip.file("word/media/page-3.png")).toBeNull();
  });

  it("handles embedded subset fonts and preserves every text run without duplication", async () => {
    const source = new PDFKit({ size: [300, 300], margin: 20 });
    const chunks: Buffer[] = [];
    source.on("data", (chunk: Buffer) => chunks.push(chunk));
    const complete = new Promise<Buffer>((resolve, reject) => {
      source.on("end", () => resolve(Buffer.concat(chunks)));
      source.on("error", reject);
    });
    const fontPath = path.join(
      path.dirname(require.resolve("pdfjs-dist/package.json")),
      "standard_fonts",
      "LiberationSans-Regular.ttf",
    );
    source
      .font(fontPath)
      .fontSize(12)
      .fillColor("#336699")
      .text("Editable æøå & subset font", 25, 25);
    source.fillColor("black").text("Second line", 25, 70);
    source.end();
    const inputPath = path.join(dir, "embedded.pdf"),
      outputPath = path.join(dir, "output.docx");
    fs.writeFileSync(inputPath, await complete);
    const result = await new PdfAdapter().convert(
      {
        inputPath,
        outputPath,
        inputFormat: "pdf",
        outputFormat: "docx",
        supported: true,
      },
      { dpi: 72 },
    );
    expect(result.success, result.error).toBe(true);
    const { zip, source: text } = await documentXml();
    expect(text).toContain("Editable æøå &amp; subset font");
    expect(text).toContain("Second line");
    expect(text).toContain('w:val="336699"');
    const png = await zip.file("word/media/page-1.png")!.async("nodebuffer");
    const stats = await sharp(png).stats();
    expect(stats.channels.map((channel) => channel.min)).toEqual([
      255, 255, 255, 255,
    ]);
  });

  it("explicitly reports image-only scanned and unsupported rotated text pages", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 200]);
    pdf
      .addPage([200, 200])
      .drawText("Rotated", { x: 100, y: 100, rotate: degrees(45), size: 10 });
    const result = await convert(pdf, { dpi: 72 });
    expect(result.success, result.error).toBe(true);
    expect(result.metadata?.warning).toContain("2 scanned/rotated page(s)");
    const { source } = await documentXml();
    expect(source).not.toContain("<w:t ");
    expect(source.match(/<a:blip /g)?.length).toBe(2);
  });

  it("does not overwrite an existing destination or leave temporary files on failure", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 200]);
    fs.writeFileSync(path.join(dir, "output.docx"), "existing document");
    const result = await convert(pdf, { dpi: 999 });
    expect(result.success).toBe(false);
    expect(fs.readFileSync(path.join(dir, "output.docx"), "utf8")).toBe(
      "existing document",
    );
    expect(
      fs.readdirSync(dir).filter((name) => name.startsWith(".fc-")),
    ).toEqual([]);
  });

  it("rejects oversized Word pages and page selections above the resource limit", async () => {
    const large = await PDFDocument.create();
    large.addPage([1600, 200]);
    expect((await convert(large)).error).toMatch(/maximum page size/);
    const many = await PDFDocument.create();
    for (let i = 0; i < 51; i++) many.addPage([100, 100]);
    expect((await convert(many)).error).toMatch(/exceeds limit/);
    expect(fs.existsSync(path.join(dir, "output.docx"))).toBe(false);
  });
});

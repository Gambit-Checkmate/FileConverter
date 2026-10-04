import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import JSZip from "jszip";
import type { ConversionParameters, ConversionResult } from "../base-adapter";
import {
  assertBitmapBudget,
  assertPageBudget,
  parsePageSelection,
  resolveDpi,
} from "./pdf-rasterizer";
import {
  detectGrids,
  extractRules,
  insideGrid,
  multiply,
  PdfGrid,
  PdfTextBox,
} from "./pdf-docx-layout";

// Strip characters that XML 1.0 forbids in PDF text.
const xml = (value: string) =>
  Array.from(value)
    .filter((char) => {
      const code = char.codePointAt(0)!;
      return (
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 32 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) ||
        (code >= 0x10000 && code <= 0x10ffff)
      );
    })
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const twip = (points: number) => Math.round(points * 20);
const emu = (points: number) => Math.round(points * 12700);
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const wordNamespace =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const relNamespace =
  "http://schemas.openxmlformats.org/package/2006/relationships";

function run(box: PdfTextBox): string {
  return (
    `<w:r><w:rPr><w:rFonts w:ascii="${xml(box.font)}" w:hAnsi="${xml(box.font)}" w:cs="${xml(box.font)}"/>` +
    `<w:sz w:val="${Math.max(2, Math.round(box.size * 2))}"/><w:color w:val="${box.color}"/>` +
    `${box.bold ? "<w:b/>" : ""}${box.italic ? "<w:i/>" : ""}</w:rPr>` +
    `<w:t xml:space="preserve">${xml(box.text)}</w:t></w:r>`
  );
}

function frame(box: PdfTextBox): string {
  return (
    `<w:p><w:pPr><w:framePr w:w="${twip(box.width + 3)}" w:h="${twip(box.size * 1.5)}" ` +
    `w:x="${twip(box.x)}" w:y="${twip(box.y)}" w:hAnchor="page" w:vAnchor="page" ` +
    'w:wrap="none" w:hRule="atLeast"/><w:spacing w:before="0" w:after="0"/>' +
    `<w:textDirection w:val="lrTb"/></w:pPr>${run(box)}</w:p>`
  );
}

function table(grid: PdfGrid, boxes: PdfTextBox[]): string {
  const { xs, ys } = grid;
  const widths = xs.slice(1).map((x, i) => twip(x - xs[i]));
  const cells = ys
    .slice(1)
    .map((y, r) => {
      const rowCells = xs
        .slice(1)
        .map((x, c) => {
          const content = boxes
            .filter(
              (b) =>
                b.x >= xs[c] - 0.5 && b.x < x && b.y >= ys[r] - 0.5 && b.y < y,
            )
            .sort((a, b) => (Math.abs(a.y - b.y) < 2 ? a.x - b.x : a.y - b.y));
          const lines: PdfTextBox[][] = [];
          for (const box of content) {
            const last = lines[lines.length - 1];
            if (last && Math.abs(last[0].y - box.y) < 2) last.push(box);
            else lines.push([box]);
          }
          const top = content[0] ? Math.max(0, content[0].y - ys[r]) : 0;
          const paragraphs = lines
            .map(
              (line) =>
                `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>` +
                `<w:ind w:left="${twip(Math.max(0, line[0].x - xs[c]))}"/></w:pPr>${line
                  .map((box, i) => {
                    const previous = line[i - 1];
                    const separated =
                      previous &&
                      box.x - (previous.x + previous.width) > box.size * 0.15 &&
                      !previous.text.endsWith(" ") &&
                      !box.text.startsWith(" ");
                    return (
                      (separated ? run({ ...box, text: " " }) : "") + run(box)
                    );
                  })
                  .join("")}</w:p>`,
            )
            .join("");
          return (
            `<w:tc><w:tcPr><w:tcW w:w="${widths[c]}" w:type="dxa"/><w:tcMar>` +
            `<w:top w:w="${twip(top)}" w:type="dxa"/><w:left w:w="0" w:type="dxa"/>` +
            '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/>' +
            `</w:tcMar></w:tcPr>${paragraphs || "<w:p/>"}</w:tc>`
          );
        })
        .join("");
      return `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${twip(y - ys[r])}" w:hRule="exact"/></w:trPr>${rowCells}</w:tr>`;
    })
    .join("");
  const noBorders = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((side) => `<w:${side} w:val="nil"/>`)
    .join("");
  return (
    "<w:tbl><w:tblPr>" +
    `<w:tblpPr w:horzAnchor="page" w:vertAnchor="page" w:tblpX="${twip(xs[0])}" w:tblpY="${twip(ys[0])}"/>` +
    `<w:tblW w:w="${twip(xs[xs.length - 1] - xs[0])}" w:type="dxa"/><w:tblBorders>${noBorders}</w:tblBorders>` +
    '<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>' +
    widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("") +
    `</w:tblGrid>${cells}</w:tbl><w:p><w:pPr><w:spacing w:after="0" w:line="1" w:lineRule="exact"/></w:pPr></w:p>`
  );
}

/** A graphics-only page image sits behind editable text and tables. */
function background(id: number, width: number, height: number): string {
  const cx = emu(width),
    cy = emu(height);
  return (
    '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/></w:pPr><w:r><w:drawing>' +
    `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1">` +
    `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:wrapNone/><wp:docPr id="${id}" name="PDF page ${id} graphics"/><wp:cNvGraphicFramePr/>` +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="page-${id}.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rId${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>' +
    "</wp:anchor></w:drawing></w:r></w:p>"
  );
}

function section(width: number, height: number): string {
  // Word's maximum page dimension is 22 inches (31680 twips).
  if (Math.max(width, height) > 1584)
    throw new Error("PDF page exceeds Word’s maximum page size (22 inches).");
  return (
    '<w:sectPr><w:type w:val="nextPage"/>' +
    `<w:pgSz w:w="${twip(width)}" w:h="${twip(height)}"${width > height ? ' w:orient="landscape"' : ""}/>` +
    '<w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>'
  );
}

function fontInfo(name: string): {
  font: string;
  bold: boolean;
  italic: boolean;
} {
  const clean = name.replace(/^[A-Z]{6}\+/, "");
  return {
    font: /Helvetica|Arial/i.test(clean)
      ? "Arial"
      : /Times/i.test(clean)
        ? "Times New Roman"
        : /Courier/i.test(clean)
          ? "Courier New"
          : clean.replace(/[-,](Bold|Italic|Oblique|Regular).*$/i, "") ||
            "Arial",
    bold: /bold|black|heavy/i.test(clean),
    italic: /italic|oblique/i.test(clean),
  };
}

/** Capture colors of visible glyphs in content order (PDF.js textContent may combine runs). */
function glyphColors(
  ops: { fnArray: number[]; argsArray: any[] },
  codes: Record<string, number>,
) {
  let color = "000000",
    text = "";
  const colors: string[] = [],
    stack: string[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const code = ops.fnArray[i],
      args = ops.argsArray[i];
    if (code === codes.save) stack.push(color);
    else if (code === codes.restore) color = stack.pop() ?? "000000";
    else if (code === codes.setFillRGBColor && typeof args[0] === "string")
      color = args[0].replace("#", "").toUpperCase();
    else if (
      code === codes.showText ||
      code === codes.showSpacedText ||
      code === codes.nextLineShowText ||
      code === codes.nextLineSetSpacingShowText
    ) {
      const glyphs = args.find((arg: unknown) => Array.isArray(arg));
      for (const glyph of glyphs ?? []) {
        if (typeof glyph !== "object" || !glyph?.unicode) continue;
        for (const char of glyph.unicode.replace(/\s/g, "")) {
          text += char;
          colors.push(color);
        }
      }
    }
  }
  return { text, colors };
}

export async function convertPdfToDocx(
  inputPath: string,
  outputPath: string,
  parameters: ConversionParameters,
): Promise<ConversionResult> {
  const start = Date.now();
  const dpi = resolveDpi(parameters.dpi);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(inputPath)),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
  });
  const temp = path.join(
    path.dirname(outputPath),
    `.fc-pdf-docx-${randomUUID()}.tmp`,
  );
  try {
    const document = await task.promise;
    const selected = parameters.pages
      ? parsePageSelection(parameters.pages, document.numPages)
      : Array.from({ length: document.numPages }, (_, i) => i + 1);
    assertPageBudget(selected.length);
    const zip = new JSZip(),
      body: string[] = [],
      relations: string[] = [];
    let imageOnlyPages = 0,
      tableCount = 0,
      totalPixels = 0,
      totalTextItems = 0;
    const textOps = new Set([
      pdfjs.OPS.showText,
      pdfjs.OPS.showSpacedText,
      pdfjs.OPS.nextLineShowText,
      pdfjs.OPS.nextLineSetSpacingShowText,
    ]);
    for (let index = 0; index < selected.length; index++) {
      const page = await document.getPage(selected[index]);
      const viewport = page.getViewport({ scale: 1 });
      const { width, height } = viewport;
      const sect = section(width, height);
      assertBitmapBudget(width, height, dpi);
      const ops = await page.getOperatorList();
      const content = await page.getTextContent();
      totalTextItems += content.items.length;
      if (totalTextItems > 50000)
        throw new Error(
          "PDF → DOCX exceeds the limit of 50000 text items per job.",
        );
      const palette = glyphColors(ops, pdfjs.OPS);
      let cursor = 0;
      // Invisible OCR, clipping, and stroked text cannot be replaced by ordinary Word runs.
      let unsupportedText = ops.fnArray.some(
        (code, i) =>
          code === pdfjs.OPS.setTextRenderingMode && ops.argsArray[i][0] !== 0,
      );
      const boxes: PdfTextBox[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const m = multiply(viewport.transform, item.transform);
        const size = Math.hypot(m[2], m[3]);
        if (!Number.isFinite(size) || size <= 0) continue;
        // Word frames cannot express arbitrary rotations/skew. Preserve those pages visually.
        if (
          Math.abs(m[1]) > 0.01 ||
          Math.abs(m[2]) > 0.01 ||
          m[0] < 0 ||
          item.dir === "ttb"
        )
          unsupportedText = true;
        const style = content.styles[item.fontName];
        const font = page.commonObjs.has(item.fontName)
          ? page.commonObjs.get(item.fontName)
          : undefined;
        const normalized = item.str.replace(/\s/g, "");
        const match = palette.text.indexOf(normalized, cursor);
        const color = match >= 0 ? palette.colors[match] : "000000";
        if (match >= 0) cursor = match + normalized.length;
        boxes.push({
          text: item.str,
          x: m[4],
          y: m[5] - size * (style.ascent ?? 0.8),
          width: item.width,
          size,
          ...fontInfo(font?.name ?? style.fontFamily),
          color: /^[A-F0-9]{6}$/.test(color) ? color : "000000",
        });
      }
      const imageOnly = !boxes.length || unsupportedText;
      if (imageOnly) imageOnlyPages++;
      const grids = imageOnly
        ? []
        : detectGrids(extractRules(ops, pdfjs.OPS, viewport.transform)).filter(
            (grid) =>
              boxes.some((box) => insideGrid(box, grid)) &&
              // A run crossing a cell boundary cannot be safely reconstructed as a native table.
              !boxes.some(
                (box) =>
                  insideGrid(box, grid) &&
                  grid.xs.some(
                    (x) => x > box.x + 1 && x < box.x + box.width - 1,
                  ),
              ),
          );
      tableCount += grids.length;
      const renderViewport = page.getViewport({ scale: dpi / 72 });
      totalPixels +=
        Math.ceil(renderViewport.width) * Math.ceil(renderViewport.height);
      if (totalPixels > 125_000_000)
        throw new Error(
          "PDF → DOCX exceeds the total bitmap budget; select fewer pages or lower DPI.",
        );
      const canvas = createCanvas(
        Math.ceil(renderViewport.width),
        Math.ceil(renderViewport.height),
      );
      try {
        await page.render({
          canvasContext: canvas.getContext(
            "2d",
          ) as unknown as CanvasRenderingContext2D,
          viewport: renderViewport,
          operationsFilter: imageOnly
            ? undefined
            : (i: number) => !textOps.has(ops.fnArray[i]),
        }).promise;
        zip.file(
          `word/media/page-${index + 1}.png`,
          canvas.toBuffer("image/png"),
        );
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
      relations.push(
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page-${index + 1}.png"/>`,
      );
      body.push(background(index + 1, width, height));
      if (!imageOnly) {
        body.push(
          ...grids.map((grid) =>
            table(
              grid,
              boxes.filter((box) => insideGrid(box, grid)),
            ),
          ),
        );
        body.push(
          ...boxes
            .filter((box) => !grids.some((grid) => insideGrid(box, grid)))
            .map(frame),
        );
      }
      body.push(
        index === selected.length - 1
          ? sect
          : `<w:p><w:pPr>${sect}</w:pPr></w:p>`,
      );
      page.cleanup();
    }
    zip.file(
      "[Content_Types].xml",
      declaration +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    zip.file(
      "_rels/.rels",
      declaration +
        `<Relationships xmlns="${relNamespace}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    );
    zip.file(
      "word/_rels/document.xml.rels",
      declaration +
        `<Relationships xmlns="${relNamespace}">${relations.join("")}</Relationships>`,
    );
    zip.file(
      "word/document.xml",
      declaration +
        `<w:document xmlns:w="${wordNamespace}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
        `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body.join("")}</w:body></w:document>`,
    );
    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });
    fs.writeFileSync(temp, buffer, { flag: "wx" });
    fs.renameSync(temp, outputPath);
    return {
      success: true,
      outputPath,
      duration: Date.now() - start,
      metadata: {
        format: "docx",
        pages: selected.join(","),
        engine: "pdfjs+canvas+jszip",
        warning:
          `Layout reconstruction: ${tableCount} editable ruled table(s). Images and graphics are a page background; fonts and complex tables may differ.` +
          (imageOnlyPages
            ? ` ${imageOnlyPages} scanned/rotated page(s) or page(s) with unsupported text effects preserved as images without editable text.`
            : ""),
      },
    };
  } finally {
    await task.destroy();
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

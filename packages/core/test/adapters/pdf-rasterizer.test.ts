import {
  MAX_BITMAP_PIXELS,
  MAX_DPI,
  MAX_PAGES_PER_JOB,
  MIN_DPI,
  assertBitmapBudget,
  assertPageBudget,
  buildPageOutputPath,
  resolveDpi,
} from '../../src/adapters/pdf/pdf-rasterizer';
import { PdfAdapter } from '../../src/adapters/pdf/pdf-adapter';
import { getTestFilePath } from '../setup';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

describe('pdf-rasterizer fail-closed guards', () => {
  describe('resolveDpi', () => {
    it('accepts DPI within 72–300', () => {
      expect(resolveDpi(72)).toBe(72);
      expect(resolveDpi(150)).toBe(150);
      expect(resolveDpi(300)).toBe(300);
    });

    it('defaults to 150 when omitted', () => {
      expect(resolveDpi()).toBe(150);
    });

    it('rejects DPI over 300', () => {
      expect(() => resolveDpi(301)).toThrow(/DPI must be between/);
      expect(() => resolveDpi(MAX_DPI + 1)).toThrow(/DPI must be between/);
      expect(() => resolveDpi(1200)).toThrow(/DPI must be between/);
    });

    it('rejects DPI under 72', () => {
      expect(() => resolveDpi(MIN_DPI - 1)).toThrow(/DPI must be between/);
      expect(() => resolveDpi(0)).toThrow(/DPI must be between/);
    });
  });

  describe('assertPageBudget', () => {
    it('allows page counts within the job cap', () => {
      expect(() => assertPageBudget(1)).not.toThrow();
      expect(() => assertPageBudget(MAX_PAGES_PER_JOB)).not.toThrow();
    });

    it('rejects page counts over the job cap', () => {
      expect(() => assertPageBudget(MAX_PAGES_PER_JOB + 1)).toThrow(
        /exceeds limit of/
      );
      expect(() => assertPageBudget(500)).toThrow(/exceeds limit of/);
    });

    it('rejects empty selection', () => {
      expect(() => assertPageBudget(0)).toThrow(/At least one page/);
    });
  });

  describe('assertBitmapBudget (MediaBox × DPI)', () => {
    it('allows a normal letter page at 150 DPI', () => {
      // US Letter ≈ 612×792 pt
      expect(() => assertBitmapBudget(612, 792, 150)).not.toThrow();
    });

    it('rejects a MediaBox that would blow the bitmap budget', () => {
      // At 300 DPI, scale=300/72≈4.166 → need width*height*scale² > MAX_BITMAP_PIXELS
      // Choose a huge MediaBox: 20000×20000 pt at 300 DPI
      expect(() => assertBitmapBudget(20_000, 20_000, 300)).toThrow(
        /would allocate .* pixels/
      );
    });

    it('rejects dimensions that exceed the pixel cap even at min DPI', () => {
      const side = Math.ceil(Math.sqrt(MAX_BITMAP_PIXELS)) + 1000;
      // side is in pixels at 72 DPI (scale=1), so widthPts=side
      expect(() => assertBitmapBudget(side, side, MIN_DPI)).toThrow(
        /would allocate .* pixels/
      );
    });

    it('rejects non-positive MediaBox', () => {
      expect(() => assertBitmapBudget(0, 100, 150)).toThrow(/Invalid page MediaBox/);
      expect(() => assertBitmapBudget(100, -1, 150)).toThrow(/Invalid page MediaBox/);
    });
  });

  describe('buildPageOutputPath', () => {
    it('uses sanitized stem and clamped page index for multi-page', () => {
      const out = getTestFilePath('doc.png');
      const result = buildPageOutputPath(out, 2, 3);
      expect(path.basename(result)).toBe('doc-page-2.png');
      expect(result.startsWith(path.dirname(out))).toBe(true);
    });

    it('keeps multi-page outputs inside the output directory', () => {
      const dir = path.dirname(getTestFilePath('x.png'));
      const crafted = path.join(dir, 'report.png');
      const result = buildPageOutputPath(crafted, 3, 5);
      expect(path.basename(result)).toBe('report-page-3.png');
      expect(result.startsWith(dir + path.sep)).toBe(true);
      expect(path.dirname(result)).toBe(dir);
    });
  });
});

describe('PdfAdapter PDF → image routing', () => {
  let adapter: PdfAdapter;
  let inputPath: string;
  /** Only delete files this suite created — never wipe shared test-temp (races coverage/integration). */
  const ownedPaths: string[] = [];

  const own = (filePath: string): string => {
    ownedPaths.push(filePath);
    return filePath;
  };

  beforeEach(async () => {
    adapter = new PdfAdapter();
    ownedPaths.length = 0;
    inputPath = own(getTestFilePath('pdf-raster-sample.pdf'));
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const bytes = await doc.save();
    fs.writeFileSync(inputPath, bytes);
  });

  afterEach(() => {
    for (const filePath of ownedPaths) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        // ignore locked/missing
      }
    }
    ownedPaths.length = 0;
  });

  it('advertises png/jpg/webp outputs', () => {
    expect(adapter.canHandle('pdf', 'png')).toBe(true);
    expect(adapter.canHandle('pdf', 'jpg')).toBe(true);
    expect(adapter.canHandle('pdf', 'webp')).toBe(true);
    expect(adapter.canHandle('pdf', 'gif')).toBe(false);
  });

  it('validateParameters rejects DPI over 300', () => {
    expect(() => adapter.validateParameters({ dpi: 400 })).toThrow(/DPI must be between/);
  });

  it('fail-closes convert when DPI is over 300', async () => {
    const outputPath = own(getTestFilePath('pdf-raster-out.png'));
    const result = await adapter.convert(
      {
        inputPath,
        outputPath,
        inputFormat: 'pdf',
        outputFormat: 'png',
        supported: true,
      },
      { dpi: 999 }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/DPI must be between/);
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it('fail-closes convert when selected page count exceeds the job cap', async () => {
    // Build a PDF with more pages than the cap
    const manyPath = own(getTestFilePath('pdf-raster-many-pages.pdf'));
    const doc = await PDFDocument.create();
    for (let i = 0; i < MAX_PAGES_PER_JOB + 5; i++) {
      doc.addPage([100, 100]);
    }
    fs.writeFileSync(manyPath, await doc.save());

    const outputPath = own(getTestFilePath('pdf-raster-many-out.png'));
    const result = await adapter.convert(
      {
        inputPath: manyPath,
        outputPath,
        inputFormat: 'pdf',
        outputFormat: 'png',
        supported: true,
      },
      {} // all pages → over cap
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/exceeds limit of/);
  }, 60000);

  it('rasterizes a small PDF to PNG at safe DPI', async () => {
    const outputPath = own(getTestFilePath('pdf-raster-ok.png'));
    const result = await adapter.convert(
      {
        inputPath,
        outputPath,
        inputFormat: 'pdf',
        outputFormat: 'png',
        supported: true,
      },
      { dpi: 72 }
    );
    expect(result.success).toBe(true);
    expect(fs.existsSync(result.outputPath)).toBe(true);
    expect(fs.statSync(result.outputPath).size).toBeGreaterThan(0);
    expect(result.metadata?.engine).toBe('pdfjs+canvas+sharp');
  }, 60000);
});

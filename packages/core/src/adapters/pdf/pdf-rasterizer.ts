import fs from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';
import { sanitizeFilename, validatePath } from '../../path-security';
import logger from '../../logger';

/** Fail-closed rasterization limits (DoS / OOM floor). */
export const MIN_DPI = 72;
export const MAX_DPI = 300;
export const DEFAULT_DPI = 150;
export const MAX_PAGES_PER_JOB = 50;
/** Max pixels for a single page bitmap before canvas allocation (~100MB RGBA). */
export const MAX_BITMAP_PIXELS = 25_000_000;

const IMAGE_FORMATS = new Set(['png', 'jpg', 'jpeg', 'webp']);

export type RasterImageFormat = 'png' | 'jpg' | 'jpeg' | 'webp';

export interface RasterizeOptions {
  inputPath: string;
  outputPath: string;
  outputFormat: string;
  dpi?: number;
  /** Comma-separated 1-based page ranges, e.g. "1-3,5". Defaults to all pages (capped). */
  pages?: string;
  quality?: number;
}

export interface RasterizeResult {
  success: boolean;
  outputPath: string;
  outputPaths: string[];
  duration: number;
  error?: string;
  metadata?: {
    format: string;
    pages: string;
    dpi: number;
    pageCount: number;
  };
}

/**
 * Resolve and validate DPI. Fail closed outside [MIN_DPI, MAX_DPI].
 */
export function resolveDpi(dpi?: number): number {
  const value = dpi === undefined ? DEFAULT_DPI : Number(dpi);
  if (!Number.isFinite(value)) {
    throw new Error(`DPI must be a number between ${MIN_DPI} and ${MAX_DPI}`);
  }
  const normalized = Math.trunc(value);
  if (normalized < MIN_DPI || normalized > MAX_DPI) {
    throw new Error(`DPI must be between ${MIN_DPI} and ${MAX_DPI} (got ${normalized})`);
  }
  return normalized;
}

/**
 * Fail closed when the selected page count exceeds the per-job cap.
 */
export function assertPageBudget(pageCount: number): void {
  if (!Number.isFinite(pageCount) || pageCount < 1) {
    throw new Error('At least one page is required');
  }
  if (pageCount > MAX_PAGES_PER_JOB) {
    throw new Error(
      `Page count ${pageCount} exceeds limit of ${MAX_PAGES_PER_JOB} pages per job`
    );
  }
}

/**
 * Fail closed before canvas allocation when MediaBox × DPI would exceed the pixel budget.
 * widthPts / heightPts are PDF user-space units (1/72").
 */
export function assertBitmapBudget(widthPts: number, heightPts: number, dpi: number): void {
  if (!Number.isFinite(widthPts) || !Number.isFinite(heightPts) || widthPts <= 0 || heightPts <= 0) {
    throw new Error('Invalid page MediaBox dimensions');
  }
  const scale = dpi / 72;
  const widthPx = Math.ceil(widthPts * scale);
  const heightPx = Math.ceil(heightPts * scale);
  const pixels = widthPx * heightPx;
  if (!Number.isFinite(pixels) || pixels <= 0) {
    throw new Error('Invalid page MediaBox dimensions');
  }
  if (pixels > MAX_BITMAP_PIXELS) {
    throw new Error(
      `Page rasterization would allocate ${pixels} pixels (limit ${MAX_BITMAP_PIXELS}); lower DPI or reject oversized MediaBox`
    );
  }
}

/**
 * Build a safe per-page output path from a sanitized stem + clamped page index.
 */
export function buildPageOutputPath(
  outputPath: string,
  pageNumber: number,
  totalSelectedPages: number
): string {
  const outputDir = path.dirname(outputPath);
  const ext = path.extname(outputPath);
  const rawStem = path.basename(outputPath, ext);
  const stem = sanitizeFilename(rawStem) || 'page';
  const safePage = Math.trunc(pageNumber);
  if (!Number.isFinite(safePage) || safePage < 1) {
    throw new Error(`Invalid page index for output naming: ${pageNumber}`);
  }

  const fileName =
    totalSelectedPages === 1 ? `${stem}${ext}` : `${stem}-page-${safePage}${ext}`;

  return validatePath(path.join(outputDir, fileName), outputDir);
}

export function isRasterImageFormat(format: string): format is RasterImageFormat {
  return IMAGE_FORMATS.has(format.toLowerCase());
}

/**
 * Parse page range strings like "1-3,5,7-9" into 1-based page numbers.
 */
export function parsePageSelection(rangeStr: string, totalPages: number): number[] {
  if (totalPages < 1) {
    throw new Error('PDF has no pages');
  }

  const pages = new Set<number>();
  const parts = rangeStr.split(',').map((s) => s.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end)) {
        throw new Error(`Invalid page range: '${part}'`);
      }
      const clampedStart = Math.max(1, Math.min(start, end));
      const clampedEnd = Math.min(totalPages, Math.max(start, end));
      for (let i = clampedStart; i <= clampedEnd; i++) {
        pages.add(i);
      }
    } else {
      const page = parseInt(part, 10);
      if (isNaN(page)) {
        throw new Error(`Invalid page number: '${part}'`);
      }
      if (page >= 1 && page <= totalPages) {
        pages.add(page);
      }
    }
  }

  const selected = Array.from(pages).sort((a, b) => a - b);
  if (selected.length === 0) {
    throw new Error('No valid pages selected');
  }
  return selected;
}

function normalizeOutputFormat(format: string): 'png' | 'jpeg' | 'webp' {
  const lower = format.toLowerCase();
  if (lower === 'jpg' || lower === 'jpeg') return 'jpeg';
  if (lower === 'webp') return 'webp';
  return 'png';
}

/**
 * Rasterize PDF pages to images using pdfjs-dist + @napi-rs/canvas + Sharp.
 * Caps DPI, page count, and MediaBox×DPI before any canvas allocation.
 */
export async function rasterizePdfToImages(options: RasterizeOptions): Promise<RasterizeResult> {
  const startTime = Date.now();
  const tempFiles: string[] = [];
  const outputPaths: string[] = [];

  try {
    if (!isRasterImageFormat(options.outputFormat)) {
      throw new Error(`Unsupported raster output format: ${options.outputFormat}`);
    }

    const dpi = resolveDpi(options.dpi);
    const sharpFormat = normalizeOutputFormat(options.outputFormat);
    const quality =
      typeof options.quality === 'number' && options.quality >= 1 && options.quality <= 100
        ? options.quality
        : 85;

    const outputDir = path.dirname(options.outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(fs.readFileSync(options.inputPath));

    const document = await pdfjs.getDocument({
      data,
      disableFontFace: true,
      isEvalSupported: false,
      useSystemFonts: false,
      // Local buffer only — no network fetches for fonts/streams
      disableAutoFetch: true,
      disableStream: true,
      disableRange: true,
    }).promise;

    try {
      const totalPages = document.numPages;
      const selectedPages = options.pages
        ? parsePageSelection(options.pages, totalPages)
        : Array.from({ length: totalPages }, (_, i) => i + 1);

      assertPageBudget(selectedPages.length);

      for (const pageNumber of selectedPages) {
        const page = await document.getPage(pageNumber);
        const viewportAt72 = page.getViewport({ scale: 1 });
        assertBitmapBudget(viewportAt72.width, viewportAt72.height, dpi);

        const scale = dpi / 72;
        const viewport = page.getViewport({ scale });
        const width = Math.ceil(viewport.width);
        const height = Math.ceil(viewport.height);

        const canvas = createCanvas(width, height);
        const context = canvas.getContext('2d');
        await page.render({
          canvasContext: context as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;

        const pngBuffer = canvas.toBuffer('image/png');
        // Drop canvas backing store promptly
        canvas.width = 0;
        canvas.height = 0;

        const finalPath = buildPageOutputPath(
          options.outputPath,
          pageNumber,
          selectedPages.length
        );

        const tempPath = path.join(
          outputDir,
          `.fc-pdf-raster-${randomUUID()}-${pageNumber}.tmp`
        );
        tempFiles.push(tempPath);

        let pipeline = sharp(pngBuffer);
        if (sharpFormat === 'jpeg') {
          pipeline = pipeline.jpeg({ quality, mozjpeg: true });
        } else if (sharpFormat === 'webp') {
          pipeline = pipeline.webp({ quality });
        } else {
          pipeline = pipeline.png();
        }

        await pipeline.toFile(tempPath);
        fs.renameSync(tempPath, finalPath);
        const idx = tempFiles.indexOf(tempPath);
        if (idx >= 0) tempFiles.splice(idx, 1);

        outputPaths.push(finalPath);
        page.cleanup();
      }
    } finally {
      await document.destroy();
    }

    const primary = outputPaths[0] ?? options.outputPath;
    const duration = Date.now() - startTime;
    logger.debug('PDF rasterize completed', {
      input: options.inputPath,
      outputs: outputPaths.length,
      dpi,
      duration,
    });

    return {
      success: true,
      outputPath: primary,
      outputPaths,
      duration,
      metadata: {
        format: sharpFormat === 'jpeg' ? 'jpg' : sharpFormat,
        pages: options.pages ?? `1-${outputPaths.length}`,
        dpi,
        pageCount: outputPaths.length,
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('PDF rasterize failed', {
      input: options.inputPath,
      error: errorMessage,
      duration,
    });
    return {
      success: false,
      outputPath: options.outputPath,
      outputPaths,
      duration,
      error: errorMessage,
    };
  } finally {
    for (const tempPath of tempFiles) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {
        // best-effort cleanup
      }
    }
  }
}

import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { BaseAdapter, ConversionParameters, ConversionResult } from '../base-adapter';
import { ConversionPlan } from '../../types';
import { validatePath } from '../../path-security';
import logger from '../../logger';
import {
  isRasterImageFormat,
  rasterizePdfToImages,
  resolveDpi,
} from './pdf-rasterizer';

/**
 * PDF adapter using pdf-lib for merge, split, and basic optimization,
 * and pdfjs + @napi-rs/canvas + Sharp for PDF → image rasterization.
 * No external system binaries required.
 */
export class PdfAdapter extends BaseAdapter {
  readonly name = 'pdf';
  readonly supportedInputFormats = ['pdf'];
  readonly supportedOutputFormats = ['pdf', 'txt', 'png', 'jpg', 'jpeg', 'webp'];

  async convert(
    plan: ConversionPlan,
    parameters: ConversionParameters
  ): Promise<ConversionResult> {
    const startTime = Date.now();

    try {
      this.validateParameters(parameters);
      this.validateInputFileSize(plan.inputPath);

      const outputDir = path.dirname(plan.outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const originalSize = fs.statSync(plan.inputPath).size;
      let result: ConversionResult;

      if (isRasterImageFormat(plan.outputFormat)) {
        const raster = await rasterizePdfToImages({
          inputPath: plan.inputPath,
          outputPath: plan.outputPath,
          outputFormat: plan.outputFormat,
          dpi: typeof parameters.dpi === 'number' ? parameters.dpi : undefined,
          pages: parameters.pages,
          quality: typeof parameters.quality === 'number' ? parameters.quality : undefined,
        });
        result = {
          success: raster.success,
          outputPath: raster.outputPath,
          duration: raster.duration,
          error: raster.error,
          metadata: raster.metadata
            ? {
                format: raster.metadata.format,
                pages: raster.metadata.pages,
                engine: 'pdfjs+canvas+sharp',
              }
            : undefined,
        };
      } else if (plan.outputFormat === 'txt') {
        result = await this.extractText(plan.inputPath, plan.outputPath);
      } else if (parameters.operation === 'merge') {
        result = await this.mergePdfs(parameters.inputFiles ?? [plan.inputPath], plan.outputPath);
      } else if (parameters.operation === 'split') {
        result = await this.splitPdf(plan.inputPath, plan.outputPath, parameters.pages);
      } else if (parameters.operation === 'compress') {
        result = await this.optimizePdf(plan.inputPath, plan.outputPath);
      } else {
        throw new Error('Ukjent PDF-operasjon. Støttede operasjoner: compress, merge, split');
      }

      if (result.success && result.metadata) {
        result.metadata.originalSize = originalSize;
        if (fs.existsSync(plan.outputPath)) {
          result.metadata.size = fs.statSync(plan.outputPath).size;
          result.metadata.compressionRatio = originalSize > 0
            ? ((originalSize - (result.metadata.size ?? 0)) / originalSize * 100).toFixed(1) + '%'
            : '0%';
        }
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('PDF adapter: Operation failed', {
        input: plan.inputPath,
        output: plan.outputPath,
        error: errorMessage,
        duration,
      });

      return { success: false, outputPath: plan.outputPath, duration, error: errorMessage };
    }
  }

  private async extractText(inputPath: string, outputPath: string): Promise<ConversionResult> {
    const startTime = Date.now();
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(inputPath)) }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const content = await (await document.getPage(pageNumber)).getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    await document.destroy();
    const text = pages.join('\n\n');
    fs.writeFileSync(outputPath, text, 'utf8');
    return { success: true, outputPath, duration: Date.now() - startTime, metadata: { format: 'txt', characters: text.length } };
  }

  /**
   * Merge multiple PDF files into one using pdf-lib.
   */
  private async mergePdfs(inputFiles: string[], outputPath: string): Promise<ConversionResult> {
    const startTime = Date.now();

    const mergedPdf = await PDFDocument.create();

    for (const filePath of inputFiles) {
      const resolvedInput = path.resolve(filePath);
      if (!fs.existsSync(resolvedInput)) {
        throw new Error(`Input file not found: ${filePath}`);
      }
      const fileBytes = fs.readFileSync(resolvedInput);
      const donorPdf = await PDFDocument.load(fileBytes);
      const indices = donorPdf.getPageIndices();
      const copiedPages = await mergedPdf.copyPages(donorPdf, indices);
      for (const page of copiedPages) {
        mergedPdf.addPage(page);
      }
    }

    const pdfBytes = await mergedPdf.save();
    fs.writeFileSync(outputPath, pdfBytes);

    const duration = Date.now() - startTime;
    logger.debug('PDF merge completed', { inputFiles, output: outputPath, duration });

    return {
      success: true,
      outputPath,
      duration,
      metadata: { format: 'pdf', mergedFiles: inputFiles.length },
    };
  }

  /**
   * Extract specific pages from a PDF using pdf-lib.
   * @param pages - Comma-separated page ranges, e.g. "1-3,5,7-9" (1-indexed)
   */
  private async splitPdf(inputPath: string, outputPath: string, pages?: string): Promise<ConversionResult> {
    const startTime = Date.now();

    const sourceBytes = fs.readFileSync(inputPath);
    const sourcePdf = await PDFDocument.load(sourceBytes);
    const totalPages = sourcePdf.getPageCount();
    const indices = this.parsePageRanges(pages ?? '1', totalPages);

    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(sourcePdf, indices);
    for (const page of copiedPages) {
      newPdf.addPage(page);
    }

    const pdfBytes = await newPdf.save();
    fs.writeFileSync(outputPath, pdfBytes);

    const duration = Date.now() - startTime;
    logger.debug('PDF split completed', { input: inputPath, output: outputPath, pages, duration });

    return {
      success: true,
      outputPath,
      duration,
      metadata: { format: 'pdf', pages: pages ?? '1' },
    };
  }

  /**
   * Basic PDF optimization: reload and re-save to let pdf-lib
   * remove orphaned objects and normalize the structure.
   * Note: This does NOT recompress raster images inside the PDF.
   */
  private async optimizePdf(inputPath: string, outputPath: string): Promise<ConversionResult> {
    const startTime = Date.now();

    const sourceBytes = fs.readFileSync(inputPath);
    const pdfDoc = await PDFDocument.load(sourceBytes);

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);

    const duration = Date.now() - startTime;
    logger.debug('PDF optimization completed', { input: inputPath, output: outputPath, duration });

    return {
      success: true,
      outputPath,
      duration,
      metadata: { format: 'pdf', preset: 'optimize' },
    };
  }

  /**
   * Parse page range strings like "1-3,5,7-9" into 0-based indices.
   */
  private parsePageRanges(rangeStr: string, totalPages: number): number[] {
    const indices: number[] = [];
    const parts = rangeStr.split(',').map(s => s.trim()).filter(Boolean);

    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);

        if (isNaN(start) || isNaN(end)) {
          throw new Error(`Invalid page range: '${part}'`);
        }

        const clampedStart = Math.max(1, start);
        const clampedEnd = Math.min(totalPages, end);
        for (let i = clampedStart; i <= clampedEnd; i++) {
          indices.push(i - 1);
        }
      } else {
        const page = parseInt(part, 10);

        if (isNaN(page)) {
          throw new Error(`Invalid page number: '${part}'`);
        }

        if (page >= 1 && page <= totalPages) {
          indices.push(page - 1);
        }
      }
    }

    return indices;
  }

  validateParameters(parameters: ConversionParameters): void {
    super.validateParameters(parameters);

    if (parameters.operation && !['compress', 'merge', 'split'].includes(parameters.operation)) {
      throw new Error('Invalid PDF operation. Supported operations: compress, merge, split');
    }

    if (parameters.operation === 'merge' && (!parameters.inputFiles || parameters.inputFiles.length < 2)) {
      throw new Error('Merge operation requires at least 2 input files');
    }

    if (parameters.dpi !== undefined) {
      resolveDpi(parameters.dpi as number);
    }
  }
}

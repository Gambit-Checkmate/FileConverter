import mammoth from 'mammoth';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { OfficeParser } from 'officeparser';
import fs from 'fs';
import path from 'path';
import { BaseAdapter, ConversionParameters, ConversionResult } from '../base-adapter';
import { ConversionPlan } from '../../types';
import logger from '../../logger';
import {
  stripHtml,
  renderTextToPdf,
  renderHtmlToPdf,
  wrapInHtmlDocument,
  htmlToMarkdown,
  sanitizeHtmlForPdf,
} from '../document/html-renderers';
import { renderOfficeToPdfWithLibreOffice } from './libreoffice-renderer';
import { renderOfficeToPdfWithMicrosoftWord } from './microsoft-word-renderer';

type OfficePdfRenderer = (inputPath: string, outputPath: string) => Promise<boolean>;

/**
 * Office document adapter using Microsoft Word and LibreOffice when available.
 * Converts Office documents to PDF with the highest-fidelity available renderer.
 *
 * - Microsoft Word: DOCX/RTF -> PDF (Windows, when installed)
 * - LibreOffice: Office -> PDF (when installed)
 * - mammoth: DOCX -> HTML (semantic, preserves headings/lists/tables/images)
 * - JSZip + XML parsing: XLSX -> HTML tables
 * - officeparser: PPTX/ODT/RTF -> plain text extraction
 */
export class OfficeAdapter extends BaseAdapter {
  readonly name = 'office';
  readonly supportedInputFormats = ['docx', 'xlsx', 'pptx', 'odt', 'rtf'];
  readonly supportedOutputFormats = ['pdf', 'html', 'txt', 'md'];

  constructor(
    private readonly renderWithMicrosoftWord: OfficePdfRenderer = renderOfficeToPdfWithMicrosoftWord,
    private readonly renderWithLibreOffice: OfficePdfRenderer = renderOfficeToPdfWithLibreOffice
  ) {
    super();
  }

  async convert(
    plan: ConversionPlan,
    parameters: ConversionParameters
  ): Promise<ConversionResult> {
    const startTime = Date.now();

    try {
      this.validateParameters(parameters);

      if (!fs.existsSync(plan.inputPath)) {
        throw new Error(`Input file not found: ${plan.inputPath}`);
      }
      this.validateInputFileSize(plan.inputPath);

      const outputDir = path.dirname(plan.outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const inputFmt = plan.inputFormat.toLowerCase();
      const outputFmt = plan.outputFormat.toLowerCase();

      logger.debug('Office adapter: Starting conversion', {
        input: plan.inputPath,
        output: plan.outputPath,
        inputFormat: inputFmt,
        outputFormat: outputFmt,
      });

      let pdfRenderer: string | undefined;
      if (outputFmt === 'pdf') {
        pdfRenderer = await this.renderOfficePdf(plan.inputPath, inputFmt, plan.outputPath);
      }

      if (pdfRenderer) {
        logger.debug(`Office adapter: PDF rendered with ${pdfRenderer}`, {
          input: plan.inputPath,
          output: plan.outputPath,
        });
      } else {
        if (outputFmt === 'pdf') {
          logger.warn(
            'No compatible external Office renderer was found. PDF output uses semantic fallback rendering; complex layouts, fonts, and positioning are not preserved.'
          );
        }
        const html = await this.readToHtml(plan.inputPath, inputFmt);
        await this.writeOutput(html, outputFmt, plan.outputPath);
      }

      const duration = Date.now() - startTime;
      const outputSize = fs.existsSync(plan.outputPath) ? fs.statSync(plan.outputPath).size : 0;

      logger.debug('Office adapter: Conversion completed', {
        input: plan.inputPath,
        output: plan.outputPath,
        duration,
        outputSize,
      });

      return {
        success: true,
        outputPath: plan.outputPath,
        duration,
        metadata: { size: outputSize, format: outputFmt },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Office adapter: Conversion failed', {
        input: plan.inputPath,
        output: plan.outputPath,
        error: errorMessage,
        duration,
      });

      return { success: false, outputPath: plan.outputPath, duration, error: errorMessage };
    }
  }

  private async renderOfficePdf(inputPath: string, inputFormat: string, outputPath: string): Promise<string | undefined> {
    if (inputFormat === 'docx' || inputFormat === 'rtf') {
      if (await this.renderWithMicrosoftWord(inputPath, outputPath)) return 'Microsoft Word';
    }
    if (await this.renderWithLibreOffice(inputPath, outputPath)) return 'LibreOffice';
    return undefined;
  }

  /**
   * Reads an office file and returns HTML content.
   * Uses format-specific parsers for best quality.
   * @param filePath - Path to the input file
   * @param format - Detected input format (docx, xlsx, pptx, odt, rtf)
   * @returns HTML string
   */
  private async readToHtml(filePath: string, format: string): Promise<string> {
    switch (format) {
      case 'docx':
        return this.readDocx(filePath);
      case 'xlsx':
        return this.readXlsx(filePath);
      case 'rtf':
        return this.readRtf(filePath);
      case 'pptx':
      case 'odt':
        return this.readWithOfficeParser(filePath);
      default:
        throw new Error(`Unsupported office input format: ${format}`);
    }
  }

  /**
   * Converts DOCX to semantic HTML using mammoth.
   * Preserves headings, lists, tables, bold/italic, and images.
   */
  private async readDocx(filePath: string): Promise<string> {
    const result = await mammoth.convertToHtml({ path: filePath }, {
      convertImage: mammoth.images.imgElement((image) =>
        image.readAsBase64String().then((base64) => ({
          src: `data:${image.contentType};base64,${base64}`,
        }))
      ),
    });

    if (result.messages.length > 0) {
      logger.debug('Mammoth conversion messages', {
        messages: result.messages.map((m) => m.message),
      });
    }

    return result.value;
  }

  /**
   * Converts XLSX to HTML tables by reading the XLSX ZIP/XML structure.
   * Renders each worksheet as a separate table with headers.
   */
  private async readXlsx(filePath: string): Promise<string> {
    const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
    const sharedStrings = await this.readSharedStrings(zip);
    const sheets = await this.readWorkbookSheets(zip);
    const htmlParts: string[] = [];

    for (const sheet of sheets) {
      const sheetFile = zip.file(sheet.path);
      if (!sheetFile) {
        logger.debug('XLSX worksheet file missing', { sheet: sheet.name, path: sheet.path });
        continue;
      }

      htmlParts.push(`<h2>${this.escapeHtml(sheet.name)}</h2>`);
      htmlParts.push('<table border="1" cellpadding="4" cellspacing="0">');

      const worksheetXml = await sheetFile.async('text');
      const worksheet = this.parseXml(worksheetXml);
      const rows = this.getElementsByLocalName(worksheet, 'row');

      for (const row of rows) {
        const rowNumber = Number(row.getAttribute('r')) || htmlParts.length;
        const tag = rowNumber === 1 ? 'th' : 'td';
        htmlParts.push('<tr>');

        const cells = this.getElementsByLocalName(row, 'c');
        for (const cell of cells) {
          const value = this.readCellValue(cell, sharedStrings);
          htmlParts.push(`<${tag}>${this.escapeHtml(value)}</${tag}>`);
        }

        htmlParts.push('</tr>');
      }

      htmlParts.push('</table>');
    }

    return htmlParts.join('\n');
  }

  private async readSharedStrings(zip: JSZip): Promise<string[]> {
    const sharedStringsFile = zip.file('xl/sharedStrings.xml');
    if (!sharedStringsFile) {
      return [];
    }

    const sharedStringsXml = await sharedStringsFile.async('text');
    const sharedStrings = this.parseXml(sharedStringsXml);
    return this.getElementsByLocalName(sharedStrings, 'si').map((item) =>
      this.getElementsByLocalName(item, 't')
        .map((textNode) => textNode.textContent || '')
        .join('')
    );
  }

  private async readWorkbookSheets(zip: JSZip): Promise<Array<{ name: string; path: string }>> {
    const workbookFile = zip.file('xl/workbook.xml');
    const relationshipsFile = zip.file('xl/_rels/workbook.xml.rels');

    if (!workbookFile || !relationshipsFile) {
      throw new Error('Invalid XLSX file: missing workbook metadata');
    }

    const workbook = this.parseXml(await workbookFile.async('text'));
    const relationships = this.parseXml(await relationshipsFile.async('text'));
    const relationshipTargets = new Map<string, string>();

    for (const relationship of this.getElementsByLocalName(relationships, 'Relationship')) {
      const id = relationship.getAttribute('Id');
      const target = relationship.getAttribute('Target');
      if (id && target) {
        relationshipTargets.set(id, this.normalizeXlsxPath(target));
      }
    }

    return this.getElementsByLocalName(workbook, 'sheet').map((sheet, index) => {
      const relationshipId = sheet.getAttribute('r:id') || sheet.getAttribute('id') || '';
      const path = relationshipTargets.get(relationshipId) || `xl/worksheets/sheet${index + 1}.xml`;
      return {
        name: sheet.getAttribute('name') || `Sheet ${index + 1}`,
        path,
      };
    });
  }

  private readCellValue(cell: Element, sharedStrings: string[]): string {
    const type = cell.getAttribute('t');

    if (type === 'inlineStr') {
      return this.getElementsByLocalName(cell, 't')
        .map((textNode) => textNode.textContent || '')
        .join('');
    }

    const value = this.getElementsByLocalName(cell, 'v')[0]?.textContent || '';
    if (type === 's') {
      return sharedStrings[Number(value)] || '';
    }

    return value;
  }

  private normalizeXlsxPath(target: string): string {
    const normalized = target.replace(/\\/g, '/').replace(/^\//, '');
    return normalized.startsWith('xl/') ? normalized : `xl/${normalized}`;
  }

  private parseXml(xml: string): Document {
    return new DOMParser().parseFromString(xml, 'application/xml');
  }

  private getElementsByLocalName(root: Document | Element, localName: string): Element[] {
    return Array.from(root.getElementsByTagName('*')).filter(
      (element) => element.localName === localName || element.tagName === localName
    );
  }

  /**
   * Extracts text from an RTF file by stripping RTF control words.
   * Handles basic RTF structure including groups, control words, and unicode.
   */
  private async readRtf(filePath: string): Promise<string> {
    const rtfContent = fs.readFileSync(filePath, 'latin1');
    const text = this.stripRtf(rtfContent);
    const escaped = this.escapeHtml(text);
    const paragraphs = escaped
      .split(/\n\n+/)
      .filter((p) => p.trim().length > 0)
      .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('\n');

    return paragraphs;
  }

  /**
   * Strips RTF control sequences to extract plain text.
   */
  private stripRtf(rtf: string): string {
    let depth = 0;
    let inHeader = true;
    const output: string[] = [];
    let i = 0;

    while (i < rtf.length) {
      const ch = rtf[i];

      if (ch === '{') {
        depth++;
        i++;
        continue;
      }

      if (ch === '}') {
        depth--;
        if (depth <= 1) {
          inHeader = false;
        }
        i++;
        continue;
      }

      if (ch === '\\') {
        i++;
        if (i >= rtf.length) break;

        const next = rtf[i];

        if (next === '\'' && i + 2 < rtf.length) {
          const hex = rtf.substring(i + 1, i + 3);
          const code = parseInt(hex, 16);
          if (!isNaN(code)) {
            output.push(String.fromCharCode(code));
          }
          i += 3;
          continue;
        }

        if (next === '\\' || next === '{' || next === '}') {
          output.push(next);
          i++;
          continue;
        }

        let controlWord = '';
        while (i < rtf.length && /[a-zA-Z]/.test(rtf[i])) {
          controlWord += rtf[i];
          i++;
        }

        while (i < rtf.length && /[0-9-]/.test(rtf[i])) {
          i++;
        }

        if (i < rtf.length && rtf[i] === ' ') {
          i++;
        }

        if (controlWord === 'par' || controlWord === 'line') {
          output.push('\n');
        } else if (controlWord === 'tab') {
          output.push('\t');
        }

        continue;
      }

      if (!inHeader && depth >= 1) {
        output.push(ch);
      }

      i++;
    }

    return output.join('').trim();
  }

  /**
   * Extracts text from PPTX or ODT using officeparser.
   * Returns text wrapped in HTML paragraph tags.
   */
  private async readWithOfficeParser(filePath: string): Promise<string> {
    const ast = await OfficeParser.parseOffice(filePath);
    const { value } = await ast.to('text', {
      includeImages: false,
      textConfig: { preserveLayout: false, renderNotes: false },
    });
    const text = typeof value === 'string' ? value : String(value);
    const escaped = this.escapeHtml(text);
    const paragraphs = escaped
      .split(/\n\n+/)
      .filter((p) => p.trim().length > 0)
      .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('\n');

    return paragraphs;
  }

  /**
   * Writes HTML content to the target format.
   * @param html - HTML content (fragment, not full document)
   * @param outputFormat - Target format (pdf, html, txt, md)
   * @param outputPath - Destination file path
   */
  private async writeOutput(html: string, outputFormat: string, outputPath: string): Promise<void> {
    switch (outputFormat) {
      case 'pdf':
        await renderHtmlToPdf(html, outputPath);
        break;
      case 'html':
      case 'htm':
        fs.writeFileSync(outputPath, wrapInHtmlDocument(sanitizeHtmlForPdf(html)), 'utf-8');
        break;
      case 'txt':
        fs.writeFileSync(outputPath, stripHtml(html), 'utf-8');
        break;
      case 'md':
      case 'markdown':
        fs.writeFileSync(outputPath, htmlToMarkdown(html), 'utf-8');
        break;
      default:
        throw new Error(`Unsupported output format: ${outputFormat}`);
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

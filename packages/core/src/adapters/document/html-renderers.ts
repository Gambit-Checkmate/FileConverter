import { DOMParser } from '@xmldom/xmldom';
import { marked } from 'marked';
import PDFDocument from 'pdfkit';
import sanitizeHtml from 'sanitize-html';
import TurndownService from 'turndown';
import fs from 'fs';

/**
 * Strips HTML tags and decodes basic entities to produce plain text.
 * Uses sanitize-html to avoid incomplete sanitization vulnerabilities (CWE-79).
 * @param html - Raw HTML string
 * @returns Plain text content
 */
export function stripHtml(html: string): string {
  const text = sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  });

  return text
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Converts Markdown to plain text by rendering to HTML then stripping tags.
 * @param md - Markdown source
 * @returns Plain text content
 */
export function stripMarkdown(md: string): string {
  const html = marked.parse(md, { async: false }) as string;
  return stripHtml(html);
}

/**
 * Renders plain text content to a PDF file using pdfkit.
 * @param textContent - Plain text to render
 * @param outputPath - Destination file path
 * @returns Promise that resolves when the PDF is written
 */
export function renderTextToPdf(textContent: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(outputPath);

    doc.pipe(stream);
    doc.fontSize(12).text(textContent, { lineGap: 4 });
    doc.end();

    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

/**
 * Wraps HTML content in a full HTML document structure.
 * @param bodyHtml - HTML fragment to wrap
 * @returns Complete HTML document string
 */
export function wrapInHtmlDocument(bodyHtml: string): string {
  return `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"></head>\n<body>\n${bodyHtml}\n</body>\n</html>`;
}

/**
 * Converts HTML to Markdown using Turndown.
 * @param html - HTML content to convert
 * @returns Markdown string
 */
export function htmlToMarkdown(html: string): string {
  const turndown = new TurndownService();
  return turndown.turndown(html);
}

const PDF_ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'p', 'strong', 'b', 'em', 'i', 'br',
  'ul', 'ol', 'li', 'table', 'tr', 'th', 'td', 'img', 'hr',
];

/**
 * Sanitizes HTML content to prevent XSS vulnerabilities.
 * Strips script tags, event handlers, javascript: URLs, and risky elements.
 * Used for both PDF rendering and Office→HTML output.
 * @param html - HTML content to sanitize
 * @returns Sanitized HTML string
 */
export function sanitizeHtmlForPdf(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: PDF_ALLOWED_TAGS,
    allowedAttributes: { img: ['src'] },
    allowedSchemes: ['data'],
    allowedSchemesByTag: { img: ['data'] },
    allowProtocolRelative: false,
  });
}

/**
 * Renders a sanitized subset of HTML to PDF using PDFKit.
 * Supports headings, paragraphs, inline emphasis, lists, tables, and data-URI images.
 * @param html - HTML content
 * @param outputPath - Destination file path
 * @returns Promise that resolves when the PDF is written
 */
function textContent(node: any): string {
  if (node.nodeType === 3) return node.data || '';
  return Array.from(node.childNodes || []).map(textContent).join('');
}

type InlineFont = 'Helvetica' | 'Helvetica-Bold' | 'Helvetica-Oblique' | 'Helvetica-BoldOblique';

function inlineFont(tag: string, inheritedFont: InlineFont): InlineFont {
  const bold = inheritedFont === 'Helvetica-Bold' || inheritedFont === 'Helvetica-BoldOblique'
    || tag === 'strong' || tag === 'b';
  const italic = inheritedFont === 'Helvetica-Oblique' || inheritedFont === 'Helvetica-BoldOblique'
    || tag === 'em' || tag === 'i';
  if (bold && italic) return 'Helvetica-BoldOblique';
  if (bold) return 'Helvetica-Bold';
  if (italic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

function renderInline(doc: PDFDocument, node: any, inheritedFont: InlineFont = 'Helvetica'): void {
  if (node.nodeType === 3) {
    doc.font(inheritedFont).text(node.data || '', { continued: true });
    return;
  }

  const tag = (node.localName || node.nodeName || '').toLowerCase();
  if (tag === 'br') {
    doc.text('', { continued: false });
    return;
  }

  const childFont = inlineFont(tag, inheritedFont);
  for (const child of Array.from(node.childNodes || [])) renderInline(doc, child, childFont);
}

function renderTable(doc: PDFDocument, table: any, width: number): void {
  const rows = Array.from(table.getElementsByTagName('tr')) as any[];
  for (const row of rows) {
    const cells = Array.from(row.childNodes || []).filter((cell: any) => ['td', 'th'].includes((cell.localName || '').toLowerCase())) as any[];
    if (!cells.length) continue;
    const cellWidth = width / cells.length;
    const y = doc.y;
    const values = cells.map(textContent);
    doc.font('Helvetica').fontSize(10);
    const heights = values.map((value) => doc.heightOfString(value, { width: cellWidth - 10 }));
    const rowHeight = Math.max(...heights, 14) + 10;
    cells.forEach((cell, index) => {
      doc.rect(50 + index * cellWidth, y, cellWidth, rowHeight).stroke();
      doc.font((cell.localName || '').toLowerCase() === 'th' ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(10)
        .text(values[index], 55 + index * cellWidth, y + 5, { width: cellWidth - 10, lineBreak: true });
    });
    doc.y = y + rowHeight;
  }
  doc.font('Helvetica').moveDown(0.5);
}

function renderImage(doc: PDFDocument, image: any, width: number): void {
  const source = image.getAttribute('src') || '';
  const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(source);
  if (!match) return;
  doc.image(Buffer.from(match[2], 'base64'), { fit: [width, 360], align: 'center' });
  doc.moveDown(0.5);
}

function renderBlock(doc: PDFDocument, node: any, width: number): void {
  if (node.nodeType === 3) {
    if ((node.data || '').trim()) doc.font('Helvetica').fontSize(12).text(node.data.trim());
    return;
  }

  const tag = (node.localName || node.nodeName || '').toLowerCase();
  if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
    const size = tag === 'h1' ? 22 : tag === 'h2' ? 18 : 14;
    doc.font('Helvetica-Bold').fontSize(size).text(textContent(node), { width });
    doc.font('Helvetica').moveDown(0.5);
  } else if (tag === 'p') {
    doc.font('Helvetica').fontSize(12);
    for (const child of Array.from(node.childNodes || [])) renderInline(doc, child);
    doc.text('', { continued: false });
    doc.moveDown(0.5);
  } else if (tag === 'ul' || tag === 'ol') {
    const items = Array.from(node.childNodes || []).filter((child: any) => (child.localName || '').toLowerCase() === 'li') as any[];
    items.forEach((item, index) => {
      doc.font('Helvetica').fontSize(12).text(`${tag === 'ol' ? `${index + 1}.` : '-'} ${textContent(item)}`, { width, indent: 12 });
    });
    doc.moveDown(0.5);
  } else if (tag === 'table') renderTable(doc, node, width);
  else if (tag === 'img') renderImage(doc, node, width);
  else if (tag === 'hr') { doc.moveDown(); }
  else for (const child of Array.from(node.childNodes || [])) renderBlock(doc, child, width);
}

export function renderHtmlToPdf(html: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(outputPath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);

    try {
      doc.pipe(stream);
      const root = new DOMParser().parseFromString(`<root>${sanitizeHtmlForPdf(html)}</root>`, 'text/html').documentElement;
      const width = doc.page.width - 100;
      for (const child of Array.from(root.childNodes || [])) renderBlock(doc, child, width);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

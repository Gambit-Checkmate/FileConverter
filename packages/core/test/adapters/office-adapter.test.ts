import { OfficeAdapter } from '../../src/adapters/office/office-adapter';
import { getTestFilePath } from '../setup';
import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';

vi.mock('mammoth', async () => {
  const actual = await vi.importActual<typeof mammoth>('mammoth');
  return {
    ...actual,
    default: {
      ...actual.default,
      convertToHtml: vi.fn(actual.default.convertToHtml),
      images: actual.default.images,
    },
  };
});

describe('OfficeAdapter', () => {
  let adapter: OfficeAdapter;

  beforeAll(() => {
    adapter = new OfficeAdapter();
  });

  describe('canHandle', () => {
    it('should support docx to pdf conversion', () => {
      expect(adapter.canHandle('docx', 'pdf')).toBe(true);
    });

    it('should support docx to html conversion', () => {
      expect(adapter.canHandle('docx', 'html')).toBe(true);
    });

    it('should support docx to txt conversion', () => {
      expect(adapter.canHandle('docx', 'txt')).toBe(true);
    });

    it('should support docx to md conversion', () => {
      expect(adapter.canHandle('docx', 'md')).toBe(true);
    });

    it('should support xlsx to pdf conversion', () => {
      expect(adapter.canHandle('xlsx', 'pdf')).toBe(true);
    });

    it('should support xlsx to html conversion', () => {
      expect(adapter.canHandle('xlsx', 'html')).toBe(true);
    });

    it('should support pptx to txt conversion', () => {
      expect(adapter.canHandle('pptx', 'txt')).toBe(true);
    });

    it('should support odt to html conversion', () => {
      expect(adapter.canHandle('odt', 'html')).toBe(true);
    });

    it('should support rtf to pdf conversion', () => {
      expect(adapter.canHandle('rtf', 'pdf')).toBe(true);
    });

    it('should not support unsupported input formats', () => {
      expect(adapter.canHandle('doc', 'pdf')).toBe(false);
      expect(adapter.canHandle('ppt', 'pdf')).toBe(false);
      expect(adapter.canHandle('xls', 'pdf')).toBe(false);
    });

    it('should not support unsupported output formats', () => {
      expect(adapter.canHandle('docx', 'docx')).toBe(false);
      expect(adapter.canHandle('docx', 'xlsx')).toBe(false);
    });
  });

  describe('supportedFormats', () => {
    it('should list all supported input formats', () => {
      expect(adapter.supportedInputFormats).toContain('docx');
      expect(adapter.supportedInputFormats).toContain('xlsx');
      expect(adapter.supportedInputFormats).toContain('pptx');
      expect(adapter.supportedInputFormats).toContain('odt');
      expect(adapter.supportedInputFormats).toContain('rtf');
    });

    it('should list all supported output formats', () => {
      expect(adapter.supportedOutputFormats).toContain('pdf');
      expect(adapter.supportedOutputFormats).toContain('html');
      expect(adapter.supportedOutputFormats).toContain('txt');
      expect(adapter.supportedOutputFormats).toContain('md');
    });
  });

  describe('convert', () => {
    it('should handle missing input file gracefully', async () => {
      const plan = {
        inputPath: getTestFilePath('non-existent.docx'),
        outputPath: getTestFilePath('output.html'),
        inputFormat: 'docx',
        outputFormat: 'html',
        supported: true,
      };

      const result = await adapter.convert(plan, {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('not found');
    });

    it('should handle unsupported output format gracefully', async () => {
      const testDocx = await createMinimalDocx(getTestFilePath('test-unsupported.docx'));
      const plan = {
        inputPath: testDocx,
        outputPath: getTestFilePath('output.xyz'),
        inputFormat: 'docx',
        outputFormat: 'xyz',
        supported: true,
      };

      const result = await adapter.convert(plan, {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    describe('DOCX conversion', () => {
      let testDocxPath: string;

      beforeAll(async () => {
        testDocxPath = await createMinimalDocx(getTestFilePath('test-document.docx'));
      });

      it('should convert docx to html', async () => {
        const outputPath = getTestFilePath('docx-output.html');
        const plan = {
          inputPath: testDocxPath,
          outputPath,
          inputFormat: 'docx',
          outputFormat: 'html',
          supported: true,
        };

        const result = await adapter.convert(plan, {});

        expect(result.success).toBe(true);
        expect(fs.existsSync(outputPath)).toBe(true);
        const content = fs.readFileSync(outputPath, 'utf-8');
        expect(content).toContain('<!DOCTYPE html>');
        expect(content).toContain('Test Document');
      });

      it('should convert docx to txt', async () => {
        const outputPath = getTestFilePath('docx-output.txt');
        const plan = {
          inputPath: testDocxPath,
          outputPath,
          inputFormat: 'docx',
          outputFormat: 'txt',
          supported: true,
        };

        const result = await adapter.convert(plan, {});

        expect(result.success).toBe(true);
        expect(fs.existsSync(outputPath)).toBe(true);
        const content = fs.readFileSync(outputPath, 'utf-8');
        expect(content).toContain('Test Document');
      });

      it('should convert docx to pdf', async () => {
        const outputPath = getTestFilePath('docx-output.pdf');
        const plan = {
          inputPath: testDocxPath,
          outputPath,
          inputFormat: 'docx',
          outputFormat: 'pdf',
          supported: true,
        };

        const result = await adapter.convert(plan, {});

        expect(result.success).toBe(true);
        expect(fs.existsSync(outputPath)).toBe(true);
        expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
      });

      it('uses Microsoft Word output before LibreOffice for DOCX files', async () => {
        const inputPath = getTestFilePath('libreoffice-input.docx');
        const outputPath = getTestFilePath('libreoffice-output.pdf');
        fs.writeFileSync(inputPath, 'not a DOCX file');
        const wordAdapter = new OfficeAdapter(
          async (_input, output) => {
            fs.writeFileSync(output, '%PDF-word');
            return true;
          },
          async () => {
            throw new Error('LibreOffice should not run after a Word conversion');
          }
        );

        const result = await wordAdapter.convert({
          inputPath,
          outputPath,
          inputFormat: 'docx',
          outputFormat: 'pdf',
          supported: true,
        }, {});

        expect(result.success).toBe(true);
        expect(fs.readFileSync(outputPath, 'utf-8')).toBe('%PDF-word');
      });

      it('uses LibreOffice when Microsoft Word is unavailable', async () => {
        const outputPath = getTestFilePath('docx-libreoffice-output.pdf');
        const libreOfficeAdapter = new OfficeAdapter(
          async () => false,
          async (_input, output) => {
            fs.writeFileSync(output, '%PDF-libreoffice');
            return true;
          }
        );

        const result = await libreOfficeAdapter.convert({
          inputPath: testDocxPath,
          outputPath,
          inputFormat: 'docx',
          outputFormat: 'pdf',
          supported: true,
        }, {});

        expect(result.success).toBe(true);
        expect(fs.readFileSync(outputPath, 'utf-8')).toBe('%PDF-libreoffice');
      });

      it('falls back to semantic PDF rendering when no external renderer is available', async () => {
        const outputPath = getTestFilePath('docx-fallback-output.pdf');
        const fallbackAdapter = new OfficeAdapter(async () => false, async () => false);

        const result = await fallbackAdapter.convert({
          inputPath: testDocxPath,
          outputPath,
          inputFormat: 'docx',
          outputFormat: 'pdf',
          supported: true,
        }, {});

        expect(result.success).toBe(true);
        expect(fs.readFileSync(outputPath).subarray(0, 4).toString()).toBe('%PDF');
      });

      it('returns a failed conversion when LibreOffice rendering fails', async () => {
        const outputPath = getTestFilePath('docx-libreoffice-error.pdf');
        const failingAdapter = new OfficeAdapter(
          async () => false,
          async () => {
            throw new Error('LibreOffice failed');
          }
        );

        const result = await failingAdapter.convert({
          inputPath: testDocxPath,
          outputPath,
          inputFormat: 'docx',
          outputFormat: 'pdf',
          supported: true,
        }, {});

        expect(result.success).toBe(false);
        expect(result.error).toContain('LibreOffice failed');
      });

      it('should convert docx to md', async () => {
        const outputPath = getTestFilePath('docx-output.md');
        const plan = {
          inputPath: testDocxPath,
          outputPath,
          inputFormat: 'docx',
          outputFormat: 'md',
          supported: true,
        };

        const result = await adapter.convert(plan, {});

        expect(result.success).toBe(true);
        expect(fs.existsSync(outputPath)).toBe(true);
        const content = fs.readFileSync(outputPath, 'utf-8');
        expect(content).toContain('Test Document');
      });

      it('should sanitize HTML output to prevent XSS attacks', async () => {
        const testDocx = await createMinimalDocx(getTestFilePath('xss-test.docx'));
        const outputPath = getTestFilePath('sanitized-output.html');
        
        const dirtyHtml = '<p>Safe Content</p><script>alert("xss")</script><p onclick="alert(1)">Click</p><a href="javascript:void(0)">Link</a><iframe src="evil.com"></iframe><object data="evil.swf"></object><embed src="evil.swf">';
        
        const mockMammoth = await import('mammoth');
        vi.mocked(mockMammoth.default.convertToHtml).mockResolvedValueOnce({
          value: dirtyHtml,
          messages: [],
        });

        const plan = {
          inputPath: testDocx,
          outputPath,
          inputFormat: 'docx',
          outputFormat: 'html',
          supported: true,
        };

        const result = await adapter.convert(plan, {});

        expect(result.success).toBe(true);
        expect(fs.existsSync(outputPath)).toBe(true);
        const content = fs.readFileSync(outputPath, 'utf-8');
        
        expect(content).not.toContain('<script');
        expect(content).not.toContain('alert');
        expect(content).not.toContain('onclick');
        expect(content).not.toContain('javascript:');
        expect(content).not.toContain('<iframe');
        expect(content).not.toContain('<object');
        expect(content).not.toContain('<embed');
        expect(content).toContain('Safe Content');
      });
    });

    describe('XLSX conversion', () => {
      let testXlsxPath: string;

      beforeAll(async () => {
        testXlsxPath = await createMinimalXlsx(getTestFilePath('test-spreadsheet.xlsx'));
      });

      it('should convert xlsx to html with table structure', async () => {
        const outputPath = getTestFilePath('xlsx-output.html');
        const plan = {
          inputPath: testXlsxPath,
          outputPath,
          inputFormat: 'xlsx',
          outputFormat: 'html',
          supported: true,
        };

        const result = await adapter.convert(plan, {});

        expect(result.success).toBe(true);
        expect(fs.existsSync(outputPath)).toBe(true);
        const content = fs.readFileSync(outputPath, 'utf-8');
        expect(content).toContain('<table');
        expect(content).toContain('Name');
        expect(content).toContain('Alice');
      });

      it('should convert xlsx to txt', async () => {
        const outputPath = getTestFilePath('xlsx-output.txt');
        const plan = {
          inputPath: testXlsxPath,
          outputPath,
          inputFormat: 'xlsx',
          outputFormat: 'txt',
          supported: true,
        };

        const result = await adapter.convert(plan, {});

        expect(result.success).toBe(true);
        expect(fs.existsSync(outputPath)).toBe(true);
        const content = fs.readFileSync(outputPath, 'utf-8');
        expect(content).toContain('Name');
        expect(content).toContain('Alice');
      });

      it('should convert xlsx to pdf', async () => {
        const outputPath = getTestFilePath('xlsx-output.pdf');
        const plan = {
          inputPath: testXlsxPath,
          outputPath,
          inputFormat: 'xlsx',
          outputFormat: 'pdf',
          supported: true,
        };

        const result = await adapter.convert(plan, {});

        expect(result.success).toBe(true);
        expect(fs.existsSync(outputPath)).toBe(true);
        expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
      });
    });

    describe('RTF conversion', () => {
      let testRtfPath: string;

      beforeAll(() => {
        testRtfPath = createMinimalRtf(getTestFilePath('test-document.rtf'));
      });

      it('should convert rtf to html', async () => {
        const outputPath = getTestFilePath('rtf-output.html');
        const plan = {
          inputPath: testRtfPath,
          outputPath,
          inputFormat: 'rtf',
          outputFormat: 'html',
          supported: true,
        };

        const result = await adapter.convert(plan, {});

        expect(result.success).toBe(true);
        expect(fs.existsSync(outputPath)).toBe(true);
        const content = fs.readFileSync(outputPath, 'utf-8');
        expect(content).toContain('<!DOCTYPE html>');
        expect(content).toContain('Hello RTF World');
      });

      it('should convert rtf to txt', async () => {
        const outputPath = getTestFilePath('rtf-output.txt');
        const plan = {
          inputPath: testRtfPath,
          outputPath,
          inputFormat: 'rtf',
          outputFormat: 'txt',
          supported: true,
        };

        const result = await adapter.convert(plan, {});

        expect(result.success).toBe(true);
        expect(fs.existsSync(outputPath)).toBe(true);
        const content = fs.readFileSync(outputPath, 'utf-8');
        expect(content).toContain('Hello RTF World');
      });
    });
  });

  describe('validateParameters', () => {
    it('should accept empty parameters', () => {
      expect(() => adapter.validateParameters({})).not.toThrow();
    });

    it('should validate quality parameter', () => {
      expect(() => adapter.validateParameters({ quality: 50 })).not.toThrow();
      expect(() => adapter.validateParameters({ quality: 0 })).toThrow();
      expect(() => adapter.validateParameters({ quality: 101 })).toThrow();
    });
  });
});

/**
 * Creates a minimal valid DOCX file for testing.
 * DOCX is a ZIP archive with specific XML files inside.
 */
async function createMinimalDocx(outputPath: string): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Test Document</w:t></w:r></w:p>
    <w:p><w:r><w:t>This is a test paragraph with some content.</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold text</w:t></w:r><w:r><w:t> and normal text.</w:t></w:r></w:p>
  </w:body>
</w:document>`);

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

/**
 * Creates a minimal valid XLSX file for testing.
 */
async function createMinimalXlsx(outputPath: string): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);

  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="TestSheet" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`);

  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`);

  zip.file('xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="7" uniqueCount="7">
  <si><t>Name</t></si>
  <si><t>Age</t></si>
  <si><t>City</t></si>
  <si><t>Alice</t></si>
  <si><t>Oslo</t></si>
  <si><t>Bob</t></si>
  <si><t>Bergen</t></si>
</sst>`);

  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
    <row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>30</v></c><c r="C2" t="s"><v>4</v></c></row>
    <row r="3"><c r="A3" t="s"><v>5</v></c><c r="B3"><v>25</v></c><c r="C3" t="s"><v>6</v></c></row>
  </sheetData>
</worksheet>`);

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

/**
 * Creates a minimal valid RTF file for testing.
 */
function createMinimalRtf(outputPath: string): string {
  const rtfContent = String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0 Times New Roman;}}
\pard Hello RTF World\par
This is a test RTF document.\par
}`;

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, rtfContent);
  return outputPath;
}

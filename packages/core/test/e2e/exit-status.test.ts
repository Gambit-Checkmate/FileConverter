import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

describe('CLI conversion exit status', () => {
  const cli = path.join(__dirname, '../../dist/cli.js');
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'converter-exit-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function run(args: string[]) {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: root, encoding: 'utf8', timeout: 30000,
      env: { ...process.env, FILECONVERTER_DISABLE_FILE_LOGS: '1' },
    });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    return result;
  }

  function mixedBatch() {
    fs.mkdirSync(path.join(root, 'input'));
    fs.writeFileSync(path.join(root, 'input/good.md'), '# Good document');
    fs.writeFileSync(path.join(root, 'input/unsupported.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  }

  it.each([false, true])('returns 1 for mixed success/failure and preserves reports (JSON: %s)', (json) => {
    mixedBatch();
    const result = run(['convert', '-i', 'input', '-o', 'output', '-t', 'html',
      '--log-file-json', 'report.json', ...(json ? ['--json'] : [])]);
    expect(result.status).toBe(1);
    expect(fs.readFileSync(path.join(root, 'output/good.html'), 'utf8')).toContain('Good document');
    expect(fs.existsSync(path.join(root, 'report.json'))).toBe(true);
    if (json) {
      const report = JSON.parse(result.stdout);
      expect(report.successfulJobs).toBe(1);
      expect(report.failedJobs).toBe(1);
      expect(report.jobs).toHaveLength(2);
    } else {
      expect(result.stdout).toContain('CONVERSION SUMMARY');
    }
  });

  it('returns 0 for a successful conversion', () => {
    fs.writeFileSync(path.join(root, 'good.md'), '# Good');
    const result = run(['convert', '-i', 'good.md', '-o', 'output', '-t', 'html', '--json']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).failedJobs).toBe(0);
  });

  it('returns 0 for dry runs even when some plans are unsupported', () => {
    mixedBatch();
    const result = run(['convert', '-i', 'input', '-o', 'output', '-t', 'html', '--dry-run', '--json']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).failedJobs).toBe(1);
    expect(fs.existsSync(path.join(root, 'output'))).toBe(false);
  });

  it('returns 1 for a failed PDF job that does not throw from Converter', () => {
    fs.writeFileSync(path.join(root, 'broken.pdf'), '%PDF-1.7\nnot a valid PDF');
    const result = run(['pdf', '--compress', 'broken.pdf', '-o', 'output/result.pdf']);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('CONVERSION SUMMARY');
  });

  it('returns 0 for a successful PDF job', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    fs.writeFileSync(path.join(root, 'good.pdf'), await pdf.save());
    expect(run(['pdf', '--compress', 'good.pdf', '-o', 'output/result.pdf']).status).toBe(0);
    expect(fs.statSync(path.join(root, 'output/result.pdf')).size).toBeGreaterThan(0);
  });

  it('returns 1 for a rejected OCR job without downloading language models', () => {
    fs.writeFileSync(path.join(root, 'unsupported.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const result = run(['ocr', '-i', 'unsupported.svg', '-o', 'output/result.txt']);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Unsupported conversions:');
    expect(fs.existsSync(path.join(root, 'output/result.txt'))).toBe(false);
  });
});

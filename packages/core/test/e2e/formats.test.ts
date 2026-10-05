import { spawnSync } from 'child_process';
import path from 'path';

interface FormatPair {
  inputFormat: string;
  outputFormat: string;
  adapter: string;
  requiresOperation: boolean;
}

describe('CLI formats report', () => {
  function run(args: string[]) {
    const result = spawnSync(process.execPath, [path.join(__dirname, '../../dist/cli.js'), 'formats', ...args], {
      encoding: 'utf8', timeout: 30000,
      env: { ...process.env, FILECONVERTER_DISABLE_FILE_LOGS: '1', LOG_LEVEL: 'debug' },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    return result.stdout;
  }

  it('lists shipped input/output pairs in machine-readable JSON', () => {
    const pairs: FormatPair[] = JSON.parse(run(['--json']));
    const find = (input: string, output: string) => pairs.find(pair => pair.inputFormat === input && pair.outputFormat === output);
    expect(find('svg', 'png')?.adapter).toBe('sharp');
    for (const output of ['png', 'jpg', 'jpeg', 'webp', 'txt', 'docx']) {
      expect(find('pdf', output)).toMatchObject({ adapter: 'pdf', requiresOperation: false });
    }
    expect(find('png', 'txt')).toMatchObject({ adapter: 'ocr', requiresOperation: false });
    expect(find('pdf', 'pdf')).toMatchObject({ adapter: 'pdf', requiresOperation: true });
    expect(find('png', 'png')).toMatchObject({ adapter: 'sharp', requiresOperation: false });
    for (const input of ['docx', 'xlsx', 'pptx', 'odt', 'rtf']) {
      for (const output of ['pdf', 'html', 'txt', 'md']) expect(find(input, output)?.adapter).toBe('office');
      expect(find(input, 'xlsx')).toBeUndefined();
      expect(find(input, 'docx')).toBeUndefined();
    }
    expect(find('svg', 'txt')).toBeUndefined();
    expect(find('pdf', 'html')).toBeUndefined();
    expect(pairs.filter(pair => pair.requiresOperation)).toEqual([find('pdf', 'pdf')]);
  });

  it('shows conversion pairs and explains PDF operation parameters in text output', () => {
    const output = run([]);
    expect(output).toContain('SUPPORTED FILE FORMATS');
    expect(output).toMatch(/svg\s+->\s+.*png/);
    expect(output).toMatch(/pdf\s+->\s+.*txt.*docx.*png/);
    expect(output).toContain('converter pdf --merge, --split or --compress');
    expect(output).toContain('OCR');
  });
});

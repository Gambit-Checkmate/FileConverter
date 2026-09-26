const fs = require('node:fs');
const path = require('node:path');
const { AdapterManager, Converter, detectFileType, sanitizeFilename } = require('@fileconverter/core');

const outputFormats = new Set(['jpg', 'png', 'webp', 'tiff', 'pdf', 'html', 'txt', 'md']);

function failedJob(inputPath, error) {
  return { input_path: inputPath, output_path: '', status: 'failed', error };
}

async function convertFiles(inputPaths, outputDir, format) {
  if (!Array.isArray(inputPaths) || inputPaths.length === 0 ||
      inputPaths.some((inputPath) => typeof inputPath !== 'string' || !path.isAbsolute(inputPath)) ||
      typeof outputDir !== 'string' || !path.isAbsolute(outputDir) ||
      !fs.existsSync(outputDir) || !fs.statSync(outputDir).isDirectory() ||
      !outputFormats.has(format)) {
    throw new Error('Select files, an output folder, and a supported format.');
  }

  const adapterManager = new AdapterManager();
  const converter = new Converter();
  const jobs = [];

  for (const inputPath of inputPaths) {
    try {
      if (!fs.statSync(inputPath).isFile()) {
        jobs.push(failedJob(inputPath, 'The selected path is not a file.'));
        continue;
      }
      const inputFormat = (await detectFileType(inputPath)).ext;
      if (!adapterManager.getAdapter(inputFormat, format)) {
        jobs.push(failedJob(inputPath, `Conversion from ${inputFormat} to ${format} is not supported.`));
        continue;
      }

      const outputName = `${sanitizeFilename(path.parse(inputPath).name)}.${format}`;
      const outputPath = path.join(outputDir, outputName);
      if (fs.existsSync(outputPath)) {
        jobs.push(failedJob(inputPath, `Output file already exists: ${outputPath}`));
        continue;
      }

      const result = await converter.convert({
        input: inputPath,
        output: outputDir,
        format,
        retries: 0,
        quiet: true,
      });
      const job = result.jobs[0];
      if (job?.status !== 'success' || !fs.existsSync(job.plan.outputPath)) {
        jobs.push(failedJob(inputPath, job?.error || 'Conversion failed.'));
        continue;
      }
      jobs.push({ input_path: inputPath, output_path: job.plan.outputPath, status: 'completed' });
    } catch (error) {
      jobs.push(failedJob(inputPath, error instanceof Error ? error.message : String(error)));
    }
  }

  const succeeded = jobs.filter((job) => job.status === 'completed').length;
  return {
    success: succeeded === jobs.length,
    message: `${succeeded} of ${jobs.length} files converted.`,
    jobs,
  };
}

if (process.send) {
  process.once('message', async ({ inputPaths, outputDir, format }) => {
    try {
      const result = await convertFiles(inputPaths, outputDir, format);
      process.send({ ok: true, result }, () => process.disconnect());
    } catch (error) {
      process.send({ ok: false, error: error instanceof Error ? error.message : String(error) },
        () => process.disconnect());
    }
  });
}

module.exports = { convertFiles };

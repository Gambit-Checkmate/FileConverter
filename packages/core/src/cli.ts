#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import { Converter } from './converter';
import { ConversionOptions } from './types';
import { AdapterManager } from './adapters/adapter-manager';
import { listPresets } from './presets/image-presets';
import { ConfigManager } from './config/config-manager';
import { parsePositiveInt, parseIntInRange } from './input-validation';
import logger, { setConsoleLoggingEnabled } from './logger';
import chalk from 'chalk';

declare const __PKG_VERSION__: string;

const program = new Command();

program
  .name('converter')
  .description('Universal file conversion tool with batch support')
  .version(__PKG_VERSION__);

program
  .command('convert')
  .description('Convert files to specified format')
  .requiredOption('-i, --in <path>', 'Input file or folder')
  .requiredOption('-o, --out <path>', 'Output folder')
  .requiredOption('-t, --to <format>', 'Target format (e.g., png, pdf, docx)')
  .option('-r, --recursive', 'Search recursively in subfolders')
  .option('--dry-run', 'Show what would happen without converting')
  .option('--concurrency <number>', 'Number of parallel jobs (default: 1)',
    (value) => parsePositiveInt(value, 'concurrency'))
  .option('--retries <number>', 'Number of retry attempts per job (default: 2)',
    (value) => parseIntInRange(value, 'retries', 0, Number.MAX_SAFE_INTEGER))
  .option('--quality <number>', 'Quality for image conversion (1-100)',
    (value) => parseIntInRange(value, 'quality', 1, 100))
  .option('--max-width <number>', 'Maximum width for images',
    (value) => parsePositiveInt(value, 'max-width'))
  .option('--max-height <number>', 'Maximum height for images',
    (value) => parsePositiveInt(value, 'max-height'))
  .option('--strip-metadata', 'Remove metadata from images')
  .option('--preset <name>', 'Use preset (image/web, image/print, image/thumbnail, etc.)')
  .option('--log-file-json <path>', 'Save conversion job logs as JSON')
  .option('--log-file-txt <path>', 'Save conversion job logs as readable text')
  .option('--json', 'Write the conversion result as JSON')
  .action(async (options) => {
    try {
      const converter = new Converter();
      if (options.json) setConsoleLoggingEnabled(false);

      const result = await converter.convert({
        input: options.in,
        output: options.out,
        format: options.to,
        recursive: options.recursive || false,
        dryRun: options.dryRun || false,
        concurrency: options.concurrency,
        retries: options.retries,
        quality: options.quality,
        maxWidth: options.maxWidth,
        maxHeight: options.maxHeight,
        stripMetadata: options.stripMetadata,
        preset: options.preset,
        logFileJson: options.logFileJson,
        logFileTxt: options.logFileTxt,
        quiet: options.json || false,
      });
      if (options.json) console.log(JSON.stringify(result));
      if (!options.dryRun && result.failedJobs > 0) process.exitCode = 1;
    } catch (error) {
      logger.error('CLI error', { error });
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('pdf')
  .description('PDF operations (compress, merge, split)')
  .option('--compress <file>', 'Compress/optimize PDF file')
  .option('--merge <files...>', 'Merge multiple PDF files')
  .option('--split <file>', 'Split PDF file')
  .option('--pages <range>', 'Page ranges for split (e.g., 1-3,5,7-9)')
  .requiredOption('-o, --out <file>', 'Output PDF file')
  .action(async (options) => {
    try {
      const converter = new Converter();

      let operation: 'compress' | 'merge' | 'split' | undefined;
      let input: string | undefined;
      let inputFiles: string[] | undefined;

      if (options.compress) {
        operation = 'compress';
        input = options.compress;
      } else if (options.merge && options.merge.length > 0) {
        operation = 'merge';
        inputFiles = options.merge;
        input = options.merge[0];
      } else if (options.split) {
        operation = 'split';
        input = options.split;
      } else {
        throw new Error('Must specify --compress, --merge or --split');
      }

      const convertOptions: ConversionOptions = {
        input: input!,
        output: path.dirname(options.out),
        outputFile: options.out,
        format: 'pdf',
        operation,
        pages: options.pages,
        ...(inputFiles ? { inputFiles } : {}),
      };

      const result = await converter.convert(convertOptions);
      if (result.failedJobs > 0) process.exitCode = 1;
    } catch (error) {
      logger.error('PDF CLI error', { error });
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('ocr')
  .description('OCR: extract text from images (PNG, JPG, etc.)')
  .requiredOption('-i, --in <file>', 'Input image file')
  .requiredOption('-o, --out <file>', 'Output text file (.txt)')
  .option('--lang <language>', 'Language for OCR (e.g., eng, nno, deu)', 'eng')
  .action(async (options) => {
    try {
      const converter = new Converter();

      const result = await converter.convert({
        input: options.in,
        output: path.dirname(options.out),
        outputFile: options.out,
        format: 'txt',
        language: options.lang,
      });
      if (result.failedJobs > 0) process.exitCode = 1;
    } catch (error) {
      logger.error('OCR CLI error', { error });
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('formats')
  .description('Show supported input/output conversion pairs')
  .option('--json', 'Write supported conversion pairs as JSON')
  .action((options) => {
    // Registering adapters may log at debug level; JSON stdout must stay clean.
    if (options.json) setConsoleLoggingEnabled(false);
    const pairs = new AdapterManager().getSupportedConversions({ includeSameFormat: true })
      .map(pair => ({
        ...pair,
        requiresOperation: pair.inputFormat === 'pdf' && pair.outputFormat === 'pdf',
      }));
    if (options.json) {
      console.log(JSON.stringify(pairs));
      return;
    }

    console.log(chalk.bold.blue('=== SUPPORTED FILE FORMATS / CONVERSION PAIRS ==='));
    for (const adapter of new Set(pairs.map(pair => pair.adapter))) {
      console.log('\n' + chalk.bold.green(`${adapter === 'ocr' ? 'OCR' : adapter} adapter:`));
      const adapterPairs = pairs.filter(pair => pair.adapter === adapter);
      for (const input of new Set(adapterPairs.map(pair => pair.inputFormat))) {
        const outputs = adapterPairs.filter(pair => pair.inputFormat === input)
          .map(pair => pair.outputFormat + (pair.requiresOperation ? '*' : ''));
        console.log(`  ${input} -> ${outputs.join(', ')}`);
      }
    }
    console.log('\n* PDF -> PDF requires converter pdf --merge, --split or --compress.');
    console.log('OCR may download language models on first use; use converter ocr --lang <language>.');
    console.log(chalk.gray(`Total: ${pairs.length} supported conversion pairs`));
  });

program
  .command('presets')
  .description('Show available presets')
  .action(() => {
    const presets = listPresets();

    console.log(chalk.bold.blue('=== AVAILABLE PRESETS ==='));
    console.log('');

    presets.forEach(preset => {
      console.log(chalk.bold.green(`${preset.name}:`));
      console.log(`  ${preset.description}`);
      console.log(`  Parameters: ${JSON.stringify(preset.parameters, null, 2)}`);
      console.log('');
    });
  });

program
  .command('preset')
  .description('Preset operations')
  .addCommand(
    new Command('list')
      .description('List all available presets')
      .action(async () => {
        try {
          const configManager = ConfigManager.getInstance();
          const presets = await configManager.listPresets();

          console.log(chalk.bold.blue('=== AVAILABLE PRESETS ==='));
          console.log('');

          const builtin = presets.filter(p => p.scope === 'builtin');
          const global = presets.filter(p => p.scope === 'global');
          const local = presets.filter(p => p.scope === 'local');

          if (builtin.length > 0) {
            console.log(chalk.bold.green('Built-in presets:'));
            builtin.forEach(preset => {
              console.log(`  ${chalk.cyan(preset.name)} - ${preset.description}`);
              console.log(`    Type: ${preset.type}, Parameters: ${JSON.stringify(preset.parameters)}`);
            });
            console.log('');
          }

          if (global.length > 0) {
            console.log(chalk.bold.green('User presets (global):'));
            global.forEach(preset => {
              console.log(`  ${chalk.cyan(preset.name)} - ${preset.description}`);
              console.log(`    Type: ${preset.type}, Parameters: ${JSON.stringify(preset.parameters)}`);
            });
            console.log('');
          }

          if (local.length > 0) {
            console.log(chalk.bold.green('Project presets (local):'));
            local.forEach(preset => {
              console.log(`  ${chalk.cyan(preset.name)} - ${preset.description}`);
              console.log(`    Type: ${preset.type}, Parameters: ${JSON.stringify(preset.parameters)}`);
            });
            console.log('');
          }

          if (presets.length === 0) {
            console.log(chalk.yellow('No presets found.'));
          }
        } catch (error) {
          logger.error('Error listing presets', { error });
          console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('create')
      .description('Create a new preset')
      .requiredOption('-n, --name <name>', 'Preset name')
      .requiredOption('-d, --description <description>', 'Preset description')
      .requiredOption('-t, --type <type>', 'Preset type (image|pdf|document)')
      .requiredOption('-p, --parameters <parameters>', 'Preset parameters (format: key1=value1;key2=value2)')
      .option('-s, --scope <scope>', 'Preset scope (global|local)', 'local')
      .action(async (options) => {
        try {
          const configManager = ConfigManager.getInstance();

          const parameters = configManager.parsePresetParameters(options.parameters);

          if (!configManager.validatePresetParameters(options.type, parameters)) {
            throw new Error(`Invalid parameters for type '${options.type}'`);
          }

          await configManager.createPreset(
            options.name,
            options.description,
            options.type as 'image' | 'pdf' | 'document',
            parameters,
            options.scope as 'global' | 'local'
          );

          console.log(chalk.green(`Preset '${options.name}' created!`));
          console.log(`   Type: ${options.type}`);
          console.log(`   Scope: ${options.scope}`);
          console.log(`   Parameters: ${JSON.stringify(parameters)}`);
        } catch (error) {
          logger.error('Error creating preset', { error });
          console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('delete')
      .description('Delete a preset')
      .requiredOption('-n, --name <name>', 'Preset name')
      .option('-s, --scope <scope>', 'Preset scope (global|local)', 'local')
      .action(async (options) => {
        try {
          const configManager = ConfigManager.getInstance();

          const deleted = await configManager.deletePreset(
            options.name,
            options.scope as 'global' | 'local'
          );

          if (deleted) {
            console.log(chalk.green(`Preset '${options.name}' deleted!`));
          } else {
            console.log(chalk.yellow(`Preset '${options.name}' not found in scope '${options.scope}'`));
          }
        } catch (error) {
          logger.error('Error deleting preset', { error });
          console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
          process.exit(1);
        }
      })
  );

program
  .command('version')
  .description('Show version and system information')
  .action(() => {
    console.log(chalk.bold.blue('=== FILECONVERTER VERSION ==='));
    console.log(`Version: ${program.version()}`);
    console.log(`Node.js: ${process.version}`);
    console.log(`Platform: ${process.platform} ${process.arch}`);
    console.log(`Working directory: ${process.cwd()}`);
  });

process.on('uncaughtException', (error) => {
  logger.error('Unexpected error', { error });
  console.error(chalk.red('Critical error:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unexpected promise rejection', { reason, promise });
  console.error(chalk.red('Promise rejection:'), reason);
  process.exit(1);
});

if (require.main === module) {
  program.parse();
}

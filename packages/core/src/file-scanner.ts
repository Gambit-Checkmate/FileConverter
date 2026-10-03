import path from 'path';
import fs from 'fs';
import { detectFileType } from './file-detector';
import { ConversionPlan } from './types';
import { validatePath, sanitizeFilename } from './path-security';
import { sanitizeLogValue } from './log-sanitizer';
import logger from './logger';
import { AdapterManager } from './adapters/adapter-manager';

export type ConversionSupportChecker = (inputFormat: string, outputFormat: string) => boolean;

export async function scanForFiles(
  inputPath: string,
  outputDir: string,
  targetFormat: string,
  recursive: boolean = false,
  supportsConversion?: ConversionSupportChecker
): Promise<ConversionPlan[]> {
  const plans: ConversionPlan[] = [];
  
  try {
    // Check if input is a file or directory
    const stats = fs.statSync(inputPath);
    
    if (stats.isFile()) {
      // Single file
      const plan = await createConversionPlan(inputPath, outputDir, targetFormat, supportsConversion);
      plans.push(plan);
    } else if (stats.isDirectory()) {
      // Directory - find all files
      const files: string[] = [];
      
      const outputRoot = path.resolve(outputDir);
      const inputRoot = path.resolve(inputPath);
      const walk = (directory: string): void => {
        for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          const fullPath = path.join(directory, item.name);
          // Skip symlinks to avoid cycles and escaping the selected tree.
          if (item.isSymbolicLink()) continue;
          if (item.isFile()) files.push(fullPath);
          else if (recursive && item.isDirectory() &&
            !(outputRoot !== inputRoot && path.resolve(fullPath) === outputRoot)) walk(fullPath);
        }
      };
      walk(inputPath);

      logger.info('Found files in directory', {
        count: files.length,
        directory: sanitizeLogValue(inputPath),
      });
      
      for (const file of files) {
        const plan = await createConversionPlan(file, outputDir, targetFormat, supportsConversion);
        plans.push(plan);
      }
    } else {
      throw new Error(`Input path is neither file nor directory: ${inputPath}`);
    }
    
  } catch (error) {
    logger.error(`Error scanning input path: ${inputPath}`, { error });
    throw error;
  }
  
  return plans;
}

async function createConversionPlan(
  inputPath: string,
  outputDir: string,
  targetFormat: string,
  supportsConversion?: ConversionSupportChecker
): Promise<ConversionPlan> {
  const fileType = await detectFileType(inputPath);
  const inputFormat = fileType.ext;
  
  const inputBasename = sanitizeFilename(
    path.basename(inputPath, path.extname(inputPath))
  );
  const outputFilename = `${inputBasename}.${targetFormat}`;
  const outputPath = path.join(outputDir, outputFilename);

  validatePath(outputPath, outputDir);
  
  // Check if conversion is supported
  const outputSupported = supportsConversion
    ? supportsConversion(inputFormat, targetFormat)
    : new AdapterManager().getAdapter(inputFormat, targetFormat) !== null;
  const supported = fileType.supported && outputSupported;
  let reason: string | undefined;
  
  if (!fileType.supported) {
    reason = `Input format '${inputFormat}' is not supported`;
  } else if (!supported) {
    reason = supportsConversion
      ? `Conversion from '${inputFormat}' to '${targetFormat}' is not supported`
      : `Output format '${targetFormat}' is not supported`;
  }
  
  return {
    inputPath,
    outputPath,
    inputFormat,
    outputFormat: targetFormat,
    supported,
    reason
  };
}

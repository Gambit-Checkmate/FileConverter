import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { BaseAdapter, ConversionParameters, ConversionResult } from '../base-adapter';
import { ConversionPlan } from '../../types';
import logger from '../../logger';

export class SharpAdapter extends BaseAdapter {
  readonly name = 'sharp';
  readonly supportedInputFormats = ['heic', 'jpg', 'jpeg', 'png', 'webp', 'tiff', 'bmp', 'gif', 'svg'];
  readonly supportedOutputFormats = ['jpg', 'jpeg', 'png', 'webp', 'tiff'];

  async convert(
    plan: ConversionPlan,
    parameters: ConversionParameters
  ): Promise<ConversionResult> {
    const startTime = Date.now();
    
    try {
      this.validateParameters(parameters);
      this.validateInputFileSize(plan.inputPath);
      
      logger.debug(`Sharp adapter: Starting conversion`, {
        input: plan.inputPath,
        output: plan.outputPath,
        parameters
      });

      // Opprett output-mappe hvis den ikke eksisterer
      const outputDir = path.dirname(plan.outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      logger.debug(`Sharp adapter: Starting conversion`, { inputPath: plan.inputPath, outputFormat: plan.outputFormat });

      // Start med Sharp
      let sharpInstance = sharp(plan.inputPath);
      logger.debug(`Sharp adapter: Created Sharp instance`);

      // Resize hvis nødvendig
      if (parameters.maxWidth || parameters.maxHeight) {
        sharpInstance = sharpInstance.resize({
          width: parameters.maxWidth,
          height: parameters.maxHeight,
          fit: 'inside',
          withoutEnlargement: true
        });
      }

      // Strip metadata hvis ønsket
      // Sharp strips metadata by default; withMetadata({}) would retain it.
      if (!parameters.stripMetadata) sharpInstance = sharpInstance.withMetadata();

      // Konverter til riktig format med kvalitet
      const outputFormat = plan.outputFormat.toLowerCase();
      let outputBuffer: Buffer;

      switch (outputFormat) {
        case 'jpg':
        case 'jpeg':
          const jpegQuality = typeof parameters.quality === 'number' && parameters.quality >= 1 && parameters.quality <= 100 ? parameters.quality : 85;
          logger.debug(`Sharp adapter: Converting to JPEG with quality ${jpegQuality}`);
          outputBuffer = await sharpInstance
            .jpeg({ quality: jpegQuality })
            .toBuffer();
          logger.debug(`Sharp adapter: JPEG conversion completed`);
          break;
        
        case 'png':
          const pngQuality = typeof parameters.quality === 'number' && parameters.quality >= 1 && parameters.quality <= 100 ? parameters.quality : 85;
          outputBuffer = await sharpInstance
            .png({ quality: pngQuality })
            .toBuffer();
          break;
        
        case 'webp':
          const webpQuality = typeof parameters.quality === 'number' && parameters.quality >= 1 && parameters.quality <= 100 ? parameters.quality : 85;
          outputBuffer = await sharpInstance
            .webp({ quality: webpQuality })
            .toBuffer();
          break;
        
        case 'tiff':
          const tiffQuality = typeof parameters.quality === 'number' && parameters.quality >= 1 && parameters.quality <= 100 ? parameters.quality : 85;
          outputBuffer = await sharpInstance
            .tiff({ quality: tiffQuality })
            .toBuffer();
          break;
        
        default:
          throw new Error(`Unsupported output format: ${outputFormat}`);
      }

      // Write to file
      fs.writeFileSync(plan.outputPath, outputBuffer);

      // Get metadata
      const metadata = await sharp(plan.outputPath).metadata();
      const fileStats = fs.statSync(plan.outputPath);

      const duration = Date.now() - startTime;

      logger.debug(`Sharp adapter: Conversion completed`, {
        input: plan.inputPath,
        output: plan.outputPath,
        duration,
        originalSize: metadata.size,
        outputSize: fileStats.size
      });

      return {
        success: true,
        outputPath: plan.outputPath,
        duration,
        metadata: {
          width: metadata.width,
          height: metadata.height,
          size: fileStats.size,
          format: outputFormat
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error(`Sharp adapter: Conversion failed`, {
        input: plan.inputPath,
        output: plan.outputPath,
        error: errorMessage,
        duration
      });

      return {
        success: false,
        outputPath: plan.outputPath,
        duration,
        error: errorMessage
      };
    }
  }

  validateParameters(parameters: ConversionParameters): void {
    super.validateParameters(parameters);
    
    // Sharp-specific validations - quality must be number for image conversion
    if (parameters.quality !== undefined && parameters.quality !== null) {
      if (typeof parameters.quality !== 'number') {
        throw new Error('Quality must be a number for image conversion');
      }
      if (parameters.quality < 1 || parameters.quality > 100) {
        throw new Error('Quality must be between 1 and 100');
      }
    }
  }
}

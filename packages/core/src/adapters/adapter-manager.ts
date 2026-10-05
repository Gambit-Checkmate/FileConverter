import { BaseAdapter, ConversionParameters, ConversionResult } from './base-adapter';
import { ConversionPlan } from '../types';
import { SharpAdapter } from './images/sharp-adapter';
import { PdfAdapter } from './pdf/pdf-adapter';
import { DocumentAdapter } from './document/document-adapter';
import { OcrAdapter } from './ocr/ocr-adapter';
import { OfficeAdapter } from './office/office-adapter';
import logger from '../logger';

/**
 * Manages conversion adapters and routes conversion requests.
 * All adapters use pure JavaScript/npm packages — no external system dependencies.
 */
export class AdapterManager {
  private adapters: BaseAdapter[] = [];

  constructor() {
    this.registerAdapter(new SharpAdapter());
    this.registerAdapter(new PdfAdapter());
    this.registerAdapter(new DocumentAdapter());
    this.registerAdapter(new OcrAdapter());
    this.registerAdapter(new OfficeAdapter());
  }

  registerAdapter(adapter: BaseAdapter): void {
    this.adapters.push(adapter);
    logger.debug(`Registered adapter: ${adapter.name}`);
  }

  getAdapter(inputFormat: string, outputFormat: string): BaseAdapter | null {
    for (const adapter of this.adapters) {
      if (adapter.canHandle(inputFormat, outputFormat)) {
        return adapter;
      }
    }
    return null;
  }

  async convert(
    plan: ConversionPlan,
    parameters: ConversionParameters
  ): Promise<ConversionResult> {
    const adapter = this.getAdapter(plan.inputFormat, plan.outputFormat);

    if (!adapter) {
      const error = `No adapter found for conversion from ${plan.inputFormat} to ${plan.outputFormat}`;
      logger.error(error);
      return {
        success: false,
        outputPath: plan.outputPath,
        duration: 0,
        error,
      };
    }

    logger.info(`Using adapter: ${adapter.name}`, {
      inputFormat: plan.inputFormat,
      outputFormat: plan.outputFormat,
    });

    return await adapter.convert(plan, parameters);
  }

  getSupportedConversions(options: { includeSameFormat?: boolean } = {}): Array<{
    inputFormat: string;
    outputFormat: string;
    adapter: string;
  }> {
    const conversions: Array<{
      inputFormat: string;
      outputFormat: string;
      adapter: string;
    }> = [];

    for (const adapter of this.adapters) {
      for (const inputFormat of adapter.supportedInputFormats) {
        for (const outputFormat of adapter.supportedOutputFormats) {
          if ((options.includeSameFormat || inputFormat !== outputFormat) && adapter.canHandle(inputFormat, outputFormat)) {
            conversions.push({
              inputFormat,
              outputFormat,
              adapter: adapter.name,
            });
          }
        }
      }
    }

    return conversions;
  }

  listAdapters(): Array<{
    name: string;
    supportedInputFormats: string[];
    supportedOutputFormats: string[];
  }> {
    return this.adapters.map(adapter => ({
      name: adapter.name,
      supportedInputFormats: adapter.supportedInputFormats,
      supportedOutputFormats: adapter.supportedOutputFormats,
    }));
  }
}

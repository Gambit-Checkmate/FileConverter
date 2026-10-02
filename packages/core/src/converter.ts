import path from 'path';
import fs from 'fs';
import { scanForFiles } from './file-scanner';
import { ConversionPlan, ConversionOptions, ConversionResult, JobLogReportOptions } from './types';
import { JobQueue } from './job-queue';
import { ProgressTracker } from './progress';
import { ConversionParameters } from './adapters/base-adapter';
import { AdapterManager } from './adapters/adapter-manager';
import { ConfigManager } from './config/config-manager';
import { validatePath } from './path-security';
import logger from './logger';
import { writeJobLogReports } from './job-log-writer';
import chalk from 'chalk';

export class Converter {
  async convert(options: ConversionOptions): Promise<ConversionResult> {
    const { 
      input, 
      output, 
      outputFile,
      format, 
      recursive = false, 
      dryRun = false,
      concurrency = 1,
      retries = 2,
      quality,
      maxWidth,
      maxHeight,
      stripMetadata,
      preset,
      operation,
      inputFiles,
      pages,
      dpi,
      logFileJson,
      logFileTxt
      , quiet = false
    } = options;
    
    logger.info('Starting file conversion', { 
      input, 
      output, 
      format, 
      recursive, 
      dryRun,
      concurrency,
      retries
    });
    
    try {
      const outputDirectory = outputFile ? path.dirname(outputFile) : output;
      const resolvedOutput = path.resolve(outputDirectory);

      if (!fs.existsSync(resolvedOutput)) {
        fs.mkdirSync(resolvedOutput, { recursive: true });
        logger.info('Created output directory', { path: resolvedOutput });
      }
      
      // Scan for files and create conversion plan
      const dryRunAdapterManager = dryRun ? new AdapterManager() : undefined;
      const plans = await scanForFiles(
        input,
        resolvedOutput,
        format,
        recursive,
        dryRunAdapterManager
          ? (inputFormat, outputFormat) => dryRunAdapterManager.getAdapter(inputFormat, outputFormat) !== null
          : undefined
      );

      if (outputFile) {
        if (plans.length !== 1) {
          throw new Error('An explicit output file requires exactly one input file');
        }

        const resolvedOutputFile = validatePath(outputFile, resolvedOutput);
        plans[0].outputPath = resolvedOutputFile;
      }
      
      if (plans.length === 0) {
        logger.warn('No files found for conversion');
        return {
          totalJobs: 0,
          successfulJobs: 0,
          failedJobs: 0,
          totalDuration: 0,
          jobs: []
        };
      }
      
      // Analyze plans
      const supportedPlans = plans.filter(p => p.supported);
      const unsupportedPlans = plans.filter(p => !p.supported);
      
      // Show summary
      if (!quiet) this.displaySummary(plans, supportedPlans, unsupportedPlans, dryRun);
      
      if (dryRun) {
        // Show detailed plan for dry-run
        if (!quiet) this.displayDetailedPlan(plans);
        return {
          totalJobs: plans.length,
          successfulJobs: supportedPlans.length,
          failedJobs: unsupportedPlans.length,
          totalDuration: 0,
          jobs: []
        };
      }
      
      // Load configuration
      const configManager = ConfigManager.getInstance();
      const config = await configManager.loadConfig();
      
      // Prepare conversion parameters
      const conversionParameters: ConversionParameters = {
        quality,
        maxWidth,
        maxHeight,
        stripMetadata,
        operation,
        inputFiles,
        pages,
        dpi
      };

      // Merge with preset if specified
      let finalParameters = conversionParameters;
      if (preset) {
        const presetConfig = await configManager.getPreset(preset);
        if (presetConfig) {
          finalParameters = { ...presetConfig.parameters, ...conversionParameters };
          logger.debug('Preset applied', { preset, parameters: presetConfig.parameters });
        } else {
          logger.warn('Preset not found', { preset });
        }
      }

      // Merge with global defaults
      if (config.defaults) {
        finalParameters = { ...config.defaults, ...finalParameters };
      }

      // Start job queue and progress tracking
      return await this.processJobs(supportedPlans, concurrency, retries, finalParameters, {
        jsonPath: logFileJson,
        textPath: logFileTxt,
      }, quiet);
      
    } catch (error) {
      logger.error('Error during conversion', { error });
      throw error;
    }
  }

  private async processJobs(
    plans: ConversionPlan[], 
    concurrency: number, 
    retries: number,
    parameters: ConversionParameters,
    reportOptions: JobLogReportOptions
    , quiet: boolean
  ): Promise<ConversionResult> {
    const jobQueue = new JobQueue(concurrency);
    const progressTracker = new ProgressTracker();
    
    // Start progress tracking
    if (!quiet) progressTracker.start(plans.length);
    
    // Legg til event listeners for progress tracking
    jobQueue.on('jobStarted', (job) => {
      if (!quiet) progressTracker.updateJobStatus(job);
    });
    
    jobQueue.on('jobCompleted', (job) => {
      if (!quiet) progressTracker.updateJobStatus(job);
    });
    
    jobQueue.on('jobFailed', (job) => {
      if (!quiet) progressTracker.updateJobStatus(job);
    });
    
    // Legg til alle jobber i køen
    for (const plan of plans) {
      await jobQueue.addJob(plan, retries, parameters);
    }
    
    // Vent på at alle jobber er ferdig
    const result = await jobQueue.waitForCompletion();
    
    const jobLogs = jobQueue.getJobLogs();

    // Stopp progress tracking og vis sammendrag
    if (!quiet) {
      progressTracker.stop();
      progressTracker.displaySummary(result);
    }

    await writeJobLogReports(reportOptions, result, jobLogs);

    // Logg jobb-resultater
    this.logJobResults(jobLogs);
    
    return result;
  }

  private logJobResults(jobLogs: any[]): void {
    logger.info(`Conversion finished. ${jobLogs.length} jobs logged.`);
    
    for (const log of jobLogs) {
      logger.debug('Job log', log);
    }
  }
  
  private displaySummary(
    allPlans: ConversionPlan[],
    supportedPlans: ConversionPlan[],
    unsupportedPlans: ConversionPlan[],
    dryRun: boolean
  ): void {
    console.log('\n' + chalk.bold.blue('=== CONVERSION SUMMARY ==='));
    console.log(`Total number of files: ${chalk.bold(allPlans.length)}`);
    console.log(`Supported conversions: ${chalk.green.bold(supportedPlans.length)}`);
    console.log(`Unsupported conversions: ${chalk.red.bold(unsupportedPlans.length)}`);
    
    if (dryRun) {
      console.log(chalk.yellow('🔍 DRY-RUN MODE - No files will be changed'));
    }
    
    console.log('');
  }
  
  private displayDetailedPlan(plans: ConversionPlan[]): void {
    console.log(chalk.bold.cyan('=== DETAILED CONVERSION PLAN ==='));
    
    plans.forEach((plan, index) => {
      const status = plan.supported ? chalk.green('✓') : chalk.red('✗');
      const inputName = path.basename(plan.inputPath);
      const outputName = path.basename(plan.outputPath);
      
      console.log(`${index + 1}. ${status} ${chalk.bold(inputName)} → ${chalk.bold(outputName)}`);
      console.log(`   From: ${chalk.gray(plan.inputPath)}`);
      console.log(`   To:  ${chalk.gray(plan.outputPath)}`);
      console.log(`   Format: ${chalk.blue(plan.inputFormat)} → ${chalk.blue(plan.outputFormat)}`);
      
      if (!plan.supported && plan.reason) {
        console.log(`   ${chalk.red('Reason:')} ${plan.reason}`);
      }
      
      console.log('');
    });
  }
}

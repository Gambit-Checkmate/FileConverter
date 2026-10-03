import { randomBytes } from 'crypto';
import PQueue from 'p-queue';
import { ConversionJob, ConversionPlan, JobStatus, ConversionResult, JobLog } from './types';
import { AdapterManager } from './adapters/adapter-manager';
import { ConversionParameters } from './adapters/base-adapter';
import { mergePresetWithParameters } from './presets/image-presets';
import logger from './logger';
import { EventEmitter } from 'events';

export class JobQueue extends EventEmitter {
  private queue: PQueue;
  private jobs: Map<string, ConversionJob> = new Map();
  private startTime: Date;
  private jobLogs: JobLog[] = [];
  private adapterManager: AdapterManager;

  constructor(concurrency: number = 1) {
    super();
    this.queue = new PQueue({ concurrency });
    this.startTime = new Date();
    this.adapterManager = new AdapterManager();
  }

  async addJob(
    plan: ConversionPlan, 
    maxRetries: number = 2,
    parameters: ConversionParameters = {}
  ): Promise<string> {
    const jobId = this.generateJobId();
    
    const job: ConversionJob = {
      id: jobId,
      plan,
      status: 'queued',
      retryCount: 0,
      maxRetries
    };

    this.jobs.set(jobId, job);
    this.emit('jobAdded', job);

    // Legg til i køen
    this.queue.add(async () => {
      await this.processJob(job, parameters);
    });

    return jobId;
  }

  private async processJob(job: ConversionJob, parameters: ConversionParameters): Promise<void> {
    try {
      job.status = 'running';
      job.startTime = new Date();
      this.emit('jobStarted', job);

      logger.info(`Starting conversion of job ${job.id}`, {
        inputPath: job.plan.inputPath,
        outputPath: job.plan.outputPath
      });

              // Use actual conversion with adapter
        const result = await this.adapterManager.convert(job.plan, parameters);
        
        if (!result.success) {
          throw new Error(result.error || 'Conversion failed');
        }

      job.status = 'success';
      job.endTime = new Date();
      job.duration = job.endTime.getTime() - job.startTime!.getTime();

      this.logJobResult(job, true, 0, parameters);
      this.emit('jobCompleted', job);

      logger.info(`Job ${job.id} completed`, {
        duration: job.duration,
        inputPath: job.plan.inputPath
      });

    } catch (error) {
      job.status = 'failed';
      job.endTime = new Date();
      job.duration = job.endTime.getTime() - job.startTime!.getTime();
      job.error = error instanceof Error ? error.message : String(error);

      this.logJobResult(job, false, 1, parameters);

      // Try retry if we haven't reached max attempts
      if (job.retryCount < job.maxRetries) {
        job.retryCount++;
        job.status = 'queued';
        job.startTime = undefined;
        job.endTime = undefined;
        job.duration = undefined;
        job.error = undefined;

        logger.warn(`Retry ${job.retryCount}/${job.maxRetries} for job ${job.id}`, {
          inputPath: job.plan.inputPath,
          error: job.error
        });

                 // Add back to queue
         this.queue.add(async () => {
           await this.processJob(job, parameters);
         });
      } else {
        this.emit('jobFailed', job);
        logger.error(`Job ${job.id} failed after ${job.maxRetries} attempts`, {
          inputPath: job.plan.inputPath,
          error: job.error
        });
      }
    }
  }

  private logJobResult(job: ConversionJob, success: boolean, exitCode: number, parameters: ConversionParameters): void {
    // Find correct engine name based on adapter
    const adapter = this.adapterManager.getAdapter(job.plan.inputFormat, job.plan.outputFormat);
    const engineName = adapter ? adapter.name : 'unknown';

    const jobLog: JobLog = {
      jobId: job.id,
      inputPath: job.plan.inputPath,
      outputPath: job.plan.outputPath,
      engine: engineName,
      parameters: {
        ...parameters,
        inputFormat: job.plan.inputFormat,
        outputFormat: job.plan.outputFormat
      },
      startTime: job.startTime!.toISOString(),
      endTime: job.endTime!.toISOString(),
      duration: job.duration!,
      exitCode,
      success,
      error: job.error
    };

    this.jobLogs.push(jobLog);
  }



  async waitForCompletion(): Promise<ConversionResult> {
    await this.queue.onIdle();
    
    const endTime = new Date();
    const totalDuration = endTime.getTime() - this.startTime.getTime();
    
    const jobs = Array.from(this.jobs.values());
    const successfulJobs = jobs.filter(j => j.status === 'success').length;
    const failedJobs = jobs.filter(j => j.status === 'failed').length;

    const result: ConversionResult = {
      totalJobs: jobs.length,
      successfulJobs,
      failedJobs,
      totalDuration,
      jobs
    };

    return result;
  }

  getJobStatus(jobId: string): ConversionJob | undefined {
    return this.jobs.get(jobId);
  }

  getAllJobs(): ConversionJob[] {
    return Array.from(this.jobs.values());
  }

  getJobLogs(): JobLog[] {
    return this.jobLogs;
  }

  getQueueSize(): number {
    return this.queue.size;
  }

  getPendingJobs(): number {
    return this.queue.pending;
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${randomBytes(6).toString('hex')}`;
  }
}

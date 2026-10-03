export interface ConversionPlan {
  inputPath: string;
  outputPath: string;
  inputFormat: string;
  outputFormat: string;
  supported: boolean;
  reason?: string;
}

export interface ConversionOptions {
  input: string;
  projectDirectory?: string;
  includeLocalConfig?: boolean;
  output: string;
  /** Exact destination for single-file conversions. */
  outputFile?: string;
  format: string;
  recursive?: boolean;
  dryRun?: boolean;
  concurrency?: number;
  retries?: number;
  quality?: number | string; // number for bilde, string for OCR (fast/standard/high)
  maxWidth?: number;
  maxHeight?: number;
  stripMetadata?: boolean;
  preset?: string;
  presetScope?: 'builtin' | 'global' | 'local';
  // PDF-operasjoner
  operation?: 'compress' | 'merge' | 'split';
  inputFiles?: string[];
  pages?: string;
  /** Rasterization DPI for PDF → image (clamped 72–300). */
  dpi?: number;
  // OCR-operasjoner
  language?: string;
  logFileJson?: string;
  logFileTxt?: string;
  quiet?: boolean;
}

export interface ConversionJob {
  id: string;
  plan: ConversionPlan;
  status: JobStatus;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export type JobStatus = 'queued' | 'running' | 'success' | 'failed';

export interface ConversionResult {
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  totalDuration: number;
  jobs: ConversionJob[];
  plans?: ConversionPlan[];
}

export interface JobLog {
  jobId: string;
  inputPath: string;
  outputPath: string;
  engine: string;
  parameters: Record<string, any>;
  startTime: string;
  endTime: string;
  duration: number;
  exitCode: number;
  success: boolean;
  error?: string;
}

export interface JobLogReportOptions {
  jsonPath?: string;
  textPath?: string;
}

export interface FileTypeInfo {
  ext: string;
  mime: string;
  supported: boolean;
}

export interface Logger {
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
}

/// <reference types="vite/client" />
interface ConversionOptions {
  recursive?: boolean;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  stripMetadata?: boolean;
  concurrency?: number;
  retries?: number;
  language?: string;
  preset?: string;
  presetScope?: "builtin" | "global" | "local";
  operation?: "merge" | "split" | "compress";
  pages?: string;
  dpi?: number;
  outputFile?: string;
  projectDirectory?: string;
}
interface ConversionPlan {
  inputPath: string;
  outputPath: string;
  outputPaths?: string[];
  inputFormat: string;
  outputFormat: string;
  supported: boolean;
  reason?: string;
}
interface ConversionResult {
  success: boolean;
  message: string;
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  totalDuration: number;
  logs: Array<{
    inputPath: string;
    outputPath: string;
    outputPaths?: string[];
    success: boolean;
    error?: string;
    duration?: number;
  }>;
  jobs: Array<{
    input_path: string;
    output_path: string;
    output_paths?: string[];
    status: "completed" | "failed";
    error?: string;
    duration?: number;
    retryCount?: number;
  }>;
}
interface ConversionProgress {
  completed: number;
  total: number;
  message: string;
}
interface Preset {
  name: string;
  description: string;
  type: "image" | "pdf" | "document";
  parameters: Record<string, unknown>;
  scope: "builtin" | "global" | "local";
}
interface AppInfo {
  conversions: Array<{
    inputFormat: string;
    outputFormat: string;
    adapter: string;
    requiresOperation: boolean;
  }>;
  guiVersion: string;
  coreVersion: string;
  platform: string;
  arch: string;
  node: string;
  electron: string;
  chrome: string;
}
interface Window {
  fileConverter: {
    selectFiles(): Promise<string[]>;
    selectOutputFolder(): Promise<string | null>;
    convertFiles(
      inputPaths: string[],
      outputDir: string,
      format: string,
      options?: ConversionOptions,
    ): Promise<ConversionResult>;
    openOutputFolder(folderPath: string): Promise<void>;
    request(
      action: "inputs:inspect",
      payload: object,
    ): Promise<Array<{ inputPath: string; inputFormat: string }>>;
    request(action: "info", payload?: object): Promise<AppInfo>;
    request(action: "preview", payload: object): Promise<ConversionPlan[]>;
    request(action: "presets:list", payload: object): Promise<Preset[]>;
    request(
      action: "presets:create" | "presets:delete",
      payload: object,
    ): Promise<boolean>;
    saveOutputFile(format: string): Promise<string | null>;
    exportReport(
      kind: string,
      report: ConversionResult,
    ): Promise<string | null>;
    onProgress(callback: (progress: ConversionProgress) => void): () => void;
  };
}

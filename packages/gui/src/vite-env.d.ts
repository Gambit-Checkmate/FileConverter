/// <reference types="vite/client" />

interface ConversionResult {
  success: boolean;
  message: string;
  jobs: Array<{
    input_path: string;
    output_path: string;
    status: 'completed' | 'failed';
    error?: string;
  }>;
}

interface Window {
  fileConverter: {
    selectFiles(): Promise<string[]>;
    selectOutputFolder(): Promise<string | null>;
    convertFiles(inputPaths: string[], outputDir: string, format: string): Promise<ConversionResult>;
    openOutputFolder(folderPath: string): Promise<void>;
  };
}

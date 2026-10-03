import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import { ConversionParameters } from '../adapters/base-adapter';
import logger from '../logger';

export interface Preset {
  name: string;
  description: string;
  type: 'image' | 'pdf' | 'document';
  parameters: ConversionParameters;
  created?: Date;
  modified?: Date;
}

export interface ConverterConfig {
  version: string;
  presets: Record<string, Preset>;
  defaults?: {
    concurrency?: number;
    retries?: number;
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
    stripMetadata?: boolean;
  };
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    file?: string;
    console?: boolean;
  };
}

export class ConfigManager {
  private static instance: ConfigManager;
  private globalConfigPath: string;
  private localConfigPath: string;
  private userPresetsPath: string;
  private projectPresetsPath: string;

  private constructor(projectDirectory: string = process.cwd(), private includeLocal: boolean = true) {
    // Global config (system-wide)
    this.globalConfigPath = path.join(os.homedir(), '.fileconverter', 'config.json');
    
    // Local config (current directory)
    this.localConfigPath = path.join(projectDirectory, '.fileconverter.json');
    
    // User presets (user-specific)
    this.userPresetsPath = path.join(os.homedir(), '.fileconverter', 'presets.json');
    
    // Project presets (project-specific)
    this.projectPresetsPath = path.join(projectDirectory, '.fileconverter-presets.json');
  }

  static forProject(projectDirectory: string, includeLocal: boolean = true): ConfigManager {
    return new ConfigManager(path.resolve(projectDirectory), includeLocal);
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Laster konfigurasjon med riktig rekkefølge:
   * 1. Global config (system-wide)
   * 2. Local config (project-specific)
   * 3. CLI flags (overstyrer alt)
   */
  async loadConfig(cliOverrides?: Partial<ConverterConfig>): Promise<ConverterConfig> {
    const config: ConverterConfig = {
      version: '1.0.0',
      presets: {}
    };

    // 1. Last global config
    const globalConfig = await this.loadConfigFile(this.globalConfigPath);
    if (globalConfig) {
      this.mergeConfig(config, globalConfig);
      logger.debug('Global config lastet', { path: this.globalConfigPath });
    }

    // 2. Last local config (overstyrer global)
    const localConfig = this.includeLocal ? await this.loadConfigFile(this.localConfigPath) : null;
    if (localConfig) {
      this.mergeConfig(config, localConfig);
      logger.debug('Local config lastet', { path: this.localConfigPath });
    }

    // 3. Last user presets
    const userPresets = await this.loadPresetsFile(this.userPresetsPath);
    if (userPresets) {
      config.presets = { ...config.presets, ...userPresets };
      logger.debug('User presets lastet', { path: this.userPresetsPath });
    }

    // 4. Last project presets (overstyrer user presets)
    const projectPresets = this.includeLocal ? await this.loadPresetsFile(this.projectPresetsPath) : null;
    if (projectPresets) {
      config.presets = { ...config.presets, ...projectPresets };
      logger.debug('Project presets lastet', { path: this.projectPresetsPath });
    }

    // 5. CLI overrides (overstyrer alt)
    if (cliOverrides) {
      this.mergeConfig(config, cliOverrides);
      logger.debug('CLI overrides anvendt');
    }

    return config;
  }

  /**
   * Lagrer global konfigurasjon
   */
  async saveGlobalConfig(config: Partial<ConverterConfig>): Promise<void> {
    await this.ensureDirectory(path.dirname(this.globalConfigPath));
    await this.saveConfigFile(this.globalConfigPath, config);
    logger.info('Global config lagret', { path: this.globalConfigPath });
  }

  /**
   * Lagrer lokal konfigurasjon
   */
  async saveLocalConfig(config: Partial<ConverterConfig>): Promise<void> {
    await this.saveConfigFile(this.localConfigPath, config);
    logger.info('Local config lagret', { path: this.localConfigPath });
  }

  /**
   * Oppretter en ny preset
   */
  async createPreset(
    name: string,
    description: string,
    type: 'image' | 'pdf' | 'document',
    parameters: ConversionParameters,
    scope: 'global' | 'local' = 'local'
  ): Promise<void> {
    const preset: Preset = {
      name,
      description,
      type,
      parameters,
      created: new Date(),
      modified: new Date()
    };

    const presetsPath = scope === 'global' ? this.userPresetsPath : this.projectPresetsPath;
    const presets = await this.loadPresetsFile(presetsPath) || {};
    
    presets[name] = preset;
    
    if (scope === 'global') {
      await this.ensureDirectory(path.dirname(presetsPath));
    }
    
    await this.savePresetsFile(presetsPath, presets);
    
    logger.info('Preset opprettet', { 
      name, 
      type, 
      scope, 
      path: presetsPath 
    });
  }

  /**
   * Sletter en preset
   */
  async deletePreset(name: string, scope: 'global' | 'local' = 'local'): Promise<boolean> {
    const presetsPath = scope === 'global' ? this.userPresetsPath : this.projectPresetsPath;
    const presets = await this.loadPresetsFile(presetsPath);
    
    if (!presets || !presets[name]) {
      return false;
    }

    delete presets[name];
    await this.savePresetsFile(presetsPath, presets);
    
    logger.info('Preset slettet', { name, scope, path: presetsPath });
    return true;
  }

  /**
   * Lister alle tilgjengelige presets
   */
  async listPresets(): Promise<Array<Preset & { scope: 'global' | 'local' | 'builtin' }>> {
    const presets: Array<Preset & { scope: 'global' | 'local' | 'builtin' }> = [];

    // Built-in presets
    const builtinPresets = this.getBuiltinPresets();
    Object.values(builtinPresets).forEach(preset => {
      presets.push({ ...preset, scope: 'builtin' });
    });

    // User presets
    const userPresets = await this.loadPresetsFile(this.userPresetsPath);
    if (userPresets) {
      Object.values(userPresets).forEach(preset => {
        presets.push({ ...preset, scope: 'global' });
      });
    }

    // Project presets
    const projectPresets = this.includeLocal ? await this.loadPresetsFile(this.projectPresetsPath) : null;
    if (projectPresets) {
      Object.values(projectPresets).forEach(preset => {
        presets.push({ ...preset, scope: 'local' });
      });
    }

    return presets.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Henter en spesifikk preset
   */
  async getPreset(name: string, scope?: 'builtin' | 'global' | 'local'): Promise<Preset | undefined> {
    if (scope === 'builtin') return this.getBuiltinPresets()[name];
    if (scope === 'global') return (await this.loadPresetsFile(this.userPresetsPath))?.[name];
    if (scope === 'local') return (this.includeLocal ? await this.loadPresetsFile(this.projectPresetsPath) : null)?.[name];
    // Sjekk project presets først (høyest prioritet)
    const projectPresets = this.includeLocal ? await this.loadPresetsFile(this.projectPresetsPath) : null;
    if (projectPresets?.[name]) {
      return projectPresets[name];
    }

    // Sjekk user presets
    const userPresets = await this.loadPresetsFile(this.userPresetsPath);
    if (userPresets?.[name]) {
      return userPresets[name];
    }

    // Sjekk built-in presets
    const builtinPresets = this.getBuiltinPresets();
    return builtinPresets[name];
  }

  /**
   * Validerer preset-parametere
   */
  validatePresetParameters(type: string, parameters: any): boolean {
    switch (type) {
      case 'image':
        return this.validateImageParameters(parameters);
      case 'pdf':
        return this.validatePdfParameters(parameters);
      case 'document':
        return this.validateDocumentParameters(parameters);
      default:
        return false;
    }
  }

  /**
   * Parser preset-parameter string (format: "key1=value1;key2=value2")
   */
  parsePresetParameters(paramString: string): ConversionParameters {
    const parameters: ConversionParameters = {};
    
    const pairs = paramString.split(';');
    for (const pair of pairs) {
      const [key, value] = pair.trim().split('=');
      if (key && value !== undefined) {
        const trimmedKey = key.trim();
        const trimmedValue = value.trim();
        
        // Konverter til riktig type
        if (['quality', 'maxWidth', 'maxHeight', 'concurrency', 'retries'].includes(trimmedKey)) {
          parameters[trimmedKey] = Number(trimmedValue);
        } else if (['stripMetadata', 'strip'].includes(trimmedKey)) {
          if (!['true', '1', 'yes', 'false', '0', 'no'].includes(trimmedValue.toLowerCase())) throw new Error(`Invalid boolean: ${trimmedValue}`);
          parameters[trimmedKey === 'strip' ? 'stripMetadata' : trimmedKey] = 
            ['true', '1', 'yes'].includes(trimmedValue.toLowerCase());
        } else {
          parameters[trimmedKey] = trimmedValue;
        }
      }
    }
    
    return parameters;
  }

  private async loadConfigFile(filePath: string): Promise<ConverterConfig | null> {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const ext = path.extname(filePath).toLowerCase();
      
      if (ext === '.yaml' || ext === '.yml') {
        return yaml.load(content) as ConverterConfig;
      } else {
        return JSON.parse(content);
      }
    } catch (error) {
      logger.warn('Kunne ikke laste config fil', { path: filePath, error });
      return null;
    }
  }

  private async loadPresetsFile(filePath: string): Promise<Record<string, Preset> | null> {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      logger.warn('Kunne ikke laste presets fil', { path: filePath, error });
      return null;
    }
  }

  private async saveConfigFile(filePath: string, config: Partial<ConverterConfig>): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();
    let content: string;
    
    if (ext === '.yaml' || ext === '.yml') {
      content = yaml.dump(config);
    } else {
      content = JSON.stringify(config, null, 2);
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
  }

  private async savePresetsFile(filePath: string, presets: Record<string, Preset>): Promise<void> {
    fs.writeFileSync(filePath, JSON.stringify(presets, null, 2), 'utf8');
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private mergeConfig(target: ConverterConfig, source: Partial<ConverterConfig>): void {
    if (source.presets) {
      target.presets = { ...target.presets, ...source.presets };
    }
    if (source.defaults) {
      target.defaults = { ...target.defaults, ...source.defaults };
    }
    if (source.logging) {
      target.logging = { ...target.logging, ...source.logging };
    }
  }

  private getBuiltinPresets(): Record<string, Preset> {
    return {
      'image/web': {
        name: 'image/web',
        description: 'Optimized for web use',
        type: 'image',
        parameters: {
          quality: 85,
          maxWidth: 1920,
          maxHeight: 1080,
          stripMetadata: true
        }
      },
      'image/print': {
        name: 'image/print',
        description: 'High quality for printing',
        type: 'image',
        parameters: {
          quality: 95,
          maxWidth: 3000,
          maxHeight: 3000,
          stripMetadata: false
        }
      },
      'image/thumbnail': {
        name: 'image/thumbnail',
        description: 'Small thumbnail',
        type: 'image',
        parameters: {
          quality: 80,
          maxWidth: 300,
          maxHeight: 300,
          stripMetadata: true
        }
      },
      'image/social': {
        name: 'image/social',
        description: 'Optimized for social media',
        type: 'image',
        parameters: {
          quality: 90,
          maxWidth: 1200,
          maxHeight: 1200,
          stripMetadata: true
        }
      },
      'image/original': {
        name: 'image/original',
        description: 'Preserve original quality',
        type: 'image',
        parameters: {
          quality: 100,
          stripMetadata: false
        }
      },
      'pdf/screen': {
        name: 'pdf/screen',
        description: 'Optimized for screen viewing',
        type: 'pdf',
        parameters: {
          pdfSettings: 'screen'
        }
      },
      'pdf/ebook': {
        name: 'pdf/ebook',
        description: 'Optimized for e-books',
        type: 'pdf',
        parameters: {
          pdfSettings: 'ebook'
        }
      },
      'pdf/printer': {
        name: 'pdf/printer',
        description: 'High quality for printing',
        type: 'pdf',
        parameters: {
          pdfSettings: 'printer'
        }
      },
      'pdf/prepress': {
        name: 'pdf/prepress',
        description: 'High quality for prepress',
        type: 'pdf',
        parameters: {
          pdfSettings: 'prepress'
        }
      }
    };
  }

  private validateImageParameters(parameters: any): boolean {
    const validKeys = ['quality', 'maxWidth', 'maxHeight', 'stripMetadata'];
    return Object.keys(parameters).every(key => validKeys.includes(key)) &&
      (parameters.quality === undefined || (Number.isInteger(parameters.quality) && parameters.quality >= 1 && parameters.quality <= 100)) &&
      ['maxWidth', 'maxHeight'].every(key => parameters[key] === undefined || (Number.isSafeInteger(parameters[key]) && parameters[key] > 0)) &&
      (parameters.stripMetadata === undefined || typeof parameters.stripMetadata === 'boolean');
  }

  private validatePdfParameters(parameters: any): boolean {
    const validKeys = ['pdfSettings', 'compatibilityLevel', 'resolution'];
    return Object.keys(parameters).every(key => validKeys.includes(key));
  }

  private validateDocumentParameters(parameters: any): boolean {
    const validKeys = ['engine', 'template', 'standalone'];
    return Object.keys(parameters).every(key => validKeys.includes(key));
  }
}

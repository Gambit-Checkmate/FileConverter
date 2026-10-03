import winston from 'winston';
import path from 'path';
import { Logger } from './types';
import { sanitizeLogValue } from './log-sanitizer';

// Bruk en sikker plassering for logger
const getLogDir = () => {
  // Prøv å bruke user's home directory først
  const homeDir = process.env.USERPROFILE || process.env.HOME;
  if (homeDir) {
    return path.join(homeDir, '.fileconverter', 'logs');
  }
  
  // Fallback til temp directory
  const tempDir = process.env.TEMP || process.env.TMP || '/tmp';
  return path.join(tempDir, 'fileconverter', 'logs');
};

const logDir = getLogDir();

// Opprett logs-mappe hvis den ikke eksisterer
import fs from 'fs';
if (process.env.FILECONVERTER_DISABLE_FILE_LOGS !== '1' && !fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (error) {
    // Hvis vi ikke kan opprette logger-mappe, bruk console-only logging
    console.warn('Could not create log directory, using console-only logging');
  }
}

const sanitizeFormat = winston.format((info) => {
  if (typeof info.message === 'string') {
    info.message = sanitizeLogValue(info.message);
  }
  return info;
});

const consoleFormat = winston.format.combine(
  sanitizeFormat(),
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Fil format (JSON)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Sjekk om vi kan skrive til log-mappen
const canWriteToLogDir = () => {
  try {
    const testFile = path.join(logDir, 'test.log');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
};

const transports: winston.transport[] = [
  // Console transport (alltid tilgjengelig)
  new winston.transports.Console({
    format: consoleFormat
  })
];

// Legg til fil-transports kun hvis vi kan skrive til log-mappen
if (process.env.FILECONVERTER_DISABLE_FILE_LOGS !== '1' && canWriteToLogDir()) {
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'converter.log'),
      format: fileFormat
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: fileFormat
    })
  );
}

export const logger: Logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  transports
});

export function setConsoleLoggingEnabled(enabled: boolean): void {
  for (const transport of transports) {
    if (transport instanceof winston.transports.Console) transport.silent = !enabled;
  }
}

export default logger;

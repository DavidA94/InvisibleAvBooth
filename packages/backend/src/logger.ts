import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, "..", "..", "logs");

// Create logs/ directory on startup if it does not exist.
// This must happen before the file transport is initialised.
/* c8 ignore next 3 */
if (!existsSync(LOGS_DIR)) {
  mkdirSync(LOGS_DIR, { recursive: true });
}

// LOG_LEVEL defaults to "info". Set LOG_LEVEL=debug to enable debug output.
const LOG_LEVEL = (process.env["LOG_LEVEL"] ?? "info").toLowerCase();

// Every log entry includes timestamp, level, source, and message.
// userId and context are optional structured fields added by call sites.
const jsonFormat = winston.format.combine(winston.format.timestamp(), winston.format.json());

// Human-readable format for the console transport.
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, source, message, ...rest }) => {
    const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
    return `${timestamp} [${source ?? "backend"}] ${level}: ${message}${extra}`;
  }),
);

// File transport: structured JSON, single rolling file capped at 20MB.
// maxFiles: 1 means only one file is kept — oldest content is trimmed when
// the cap is reached rather than creating numbered archives.
const fileTransport = new DailyRotateFile({
  dirname: LOGS_DIR,
  filename: "app.log",
  maxSize: "20m",
  maxFiles: 1,
  format: jsonFormat,
  // Disable date-based rotation — we only want size-based rotation.
  // Setting frequency to null and datePattern to a static value achieves this.
  datePattern: "YYYY",
  auditFile: join(LOGS_DIR, ".audit.json"),
});

export const logger = winston.createLogger({
  level: LOG_LEVEL,
  defaultMeta: { source: "backend" },
  transports: [fileTransport, new winston.transports.Console({ format: consoleFormat })],
});

import { format } from "node:util";
import { formatMessagesSync } from "esbuild";

const LOGGER_LEVELS = {
  error: 0,
  warn: 1,
  log: 2,
  debug: 3,
} as const;

type LoggerLevel = keyof typeof LOGGER_LEVELS;

/** A map from LOGGER_LEVEL to the error `kind` needed by `formatMessagesSync()`. */
const LOGGER_LEVEL_FORMAT_TYPE_MAP = {
  error: "error",
  warn: "warning",
  log: undefined,
  debug: undefined,
} as const;

class Logger {
  constructor(public loggerLevel: LoggerLevel = "log") {}

  debug = (...args: unknown[]) => this.doLog("debug", args);
  log = (...args: unknown[]) => this.doLog("log", args);
  warn = (...args: unknown[]) => this.doLog("warn", args);
  error = (...args: unknown[]) => this.doLog("error", args);

  private doLog(messageLevel: LoggerLevel, args: unknown[]) {
    if (LOGGER_LEVELS[this.loggerLevel] >= LOGGER_LEVELS[messageLevel]) {
      console[messageLevel](this.formatMessage(messageLevel, format(...args)));
    }
  }

  formatMessage(level: LoggerLevel, text: string): string {
    const kind = LOGGER_LEVEL_FORMAT_TYPE_MAP[level];
    if (kind) {
      return formatMessagesSync([{ text }], {
        color: true,
        kind,
        terminalWidth: process.stdout.columns,
      })[0];
    } else {
      return text;
    }
  }
}

/**
 * A drop-in replacement for `console` for outputting logging messages.
 *
 * Errors and Warnings will get additional formatting to highlight them to the user.
 * You can also set a `logger.loggerLevel` value to one of "debug", "log", "warn" or "error",
 * to filter out logging messages.
 */
export const logger = new Logger();

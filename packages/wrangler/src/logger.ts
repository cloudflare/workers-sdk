import { format } from "node:util";
import chalk from "chalk";

const LOGGER_LEVELS = {
  error: 0,
  warn: 1,
  log: 2,
  debug: 3,
} as const;

type LoggerLevel = keyof typeof LOGGER_LEVELS;

class Logger {
  constructor(public loggerLevel: LoggerLevel = "log") {}

  debug = (...args: unknown[]) => this.doLog("debug", args);
  log = (...args: unknown[]) => this.doLog("log", args);
  warn = (...args: unknown[]) => this.doLog("warn", args);
  error = (...args: unknown[]) => this.doLog("error", args);

  private doLog(messageLevel: LoggerLevel, args: unknown[]) {
    if (LOGGER_LEVELS[this.loggerLevel] >= LOGGER_LEVELS[messageLevel]) {
      const message = format(...args).replaceAll(
        /^/gm,
        this.getLevelSymbol(messageLevel)
      );
      console[messageLevel](message);
    }
  }

  private getLevelSymbol(messageLevel: LoggerLevel): string {
    switch (messageLevel) {
      case "error":
        return process.stdout.isTTY ? chalk.red("✖  ") : "✖  ";
      case "warn":
        return process.stdout.isTTY ? chalk.yellow("⚠  ") : "⚠  ";
      default:
        return "";
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

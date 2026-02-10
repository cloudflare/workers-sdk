import { AsyncLocalStorage } from "node:async_hooks";
import { format } from "node:util";
import {
	getEnvironmentVariableFactory,
	getSanitizeLogs,
	ParseError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import CLITable from "cli-table3";
import { formatMessagesSync } from "esbuild";
import { formatMessage } from "./utils/format-message";
import { appendToDebugLogFile } from "./utils/log-file";
import type { Message } from "esbuild";

export const LOGGER_LEVELS = {
	none: -1,
	error: 0,
	warn: 1,
	info: 2,
	log: 3,
	debug: 4,
} as const;

export type LoggerLevel = keyof typeof LOGGER_LEVELS;

/** A map from LOGGER_LEVEL to the error `kind` needed by `formatMessagesSync()`. */
const LOGGER_LEVEL_FORMAT_TYPE_MAP = {
	error: "error",
	warn: "warning",
	info: undefined,
	log: undefined,
	debug: undefined,
} as const;

const getLogLevelFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_LOG",
});

function getLoggerLevel(): LoggerLevel {
	const fromEnv = getLogLevelFromEnv()?.toLowerCase();
	if (fromEnv !== undefined) {
		if (fromEnv in LOGGER_LEVELS) {
			return fromEnv as LoggerLevel;
		}
		const expected = Object.keys(LOGGER_LEVELS)
			.map((level) => `"${level}"`)
			.join(" | ");
		logger.once.warn(
			`Unrecognised WRANGLER_LOG value ${JSON.stringify(
				fromEnv
			)}, expected ${expected}, defaulting to "log"...`
		);
	}
	return "log";
}

const overrideLoggerLevel = new AsyncLocalStorage<{
	logLevel: LoggerLevel | undefined;
}>();

/**
 * This function runs a callback with a specified log level
 * The provided log level is stored using AsyncLocalStorage, and will be used
 * for all logger.* calls that happen within the callback.
 */
export const runWithLogLevel = <V>(
	overrideLogLevel: LoggerLevel | undefined,
	cb: () => V
) => overrideLoggerLevel.run({ logLevel: overrideLogLevel }, cb);

export type TableRow<Keys extends string> = Record<Keys, string>;

function consoleMethodToLoggerLevel(
	method: Exclude<keyof Console, "Console">
): LoggerLevel {
	if (method in LOGGER_LEVELS) {
		return method as LoggerLevel;
	}
	// categorize anything different from the common console methods as
	// a standard log (in the future if need be we can add logic here to
	// associate different methods to different log levels)
	return "log";
}

export class Logger {
	constructor() {}

	private overrideLoggerLevel?: LoggerLevel;
	private onceHistory = new Set<string>();

	get loggerLevel() {
		return (
			overrideLoggerLevel.getStore()?.logLevel ??
			this.overrideLoggerLevel ??
			getLoggerLevel()
		);
	}

	set loggerLevel(val) {
		this.overrideLoggerLevel = val;
	}

	resetLoggerLevel() {
		this.overrideLoggerLevel = undefined;
	}

	columns = process.stdout.columns;

	json = (data: unknown) => {
		// eslint-disable-next-line no-console
		console.log(JSON.stringify(data, null, 4));
	};

	debug = (...args: unknown[]) => this.doLog("debug", args);
	debugWithSanitization = (label: string, ...args: unknown[]) => {
		if (getSanitizeLogs()) {
			this.doLog("debug", [
				label,
				"omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data",
			]);
		} else {
			this.doLog("debug", [label, ...args]);
		}
	};
	info = (...args: unknown[]) => this.doLog("info", args);
	log = (...args: unknown[]) => this.doLog("log", args);
	warn = (...args: unknown[]) => this.doLog("warn", args);

	error(...args: unknown[]): void;
	error(error: ParseError): void;
	error(...args: unknown[] | [ParseError]) {
		if (args.length === 1 && args[0] instanceof ParseError) {
			this.doLog("error", formatMessage(args[0]));
		} else {
			this.doLog("error", args);
		}
	}
	table<Keys extends string>(
		data: TableRow<Keys>[],
		options?: { wordWrap: boolean; head?: Keys[] }
	) {
		const derivedHead =
			data.length === 0 ? [] : (Object.keys(data[0]) as Keys[]);
		const wordWrap = options?.wordWrap ?? false;
		const head = options?.head ?? derivedHead;

		const tableOptions = {
			style: {
				head: chalk.level ? ["blue"] : [],
				border: chalk.level ? ["gray"] : [],
			},
			wordWrap,
			head,
		};
		const t = new CLITable(tableOptions);
		t.push(...data.map((row) => head.map((k) => row[k])));
		return this.doLog("log", [t.toString()]);
	}
	console<M extends Exclude<keyof Console, "Console">>(
		method: M,
		...args: Parameters<Console[M]>
	) {
		// eslint-disable-next-line no-console
		if (typeof console[method] !== "function") {
			throw new Error(`console.${method}() is not a function`);
		}

		if (
			LOGGER_LEVELS[this.loggerLevel] >=
			LOGGER_LEVELS[consoleMethodToLoggerLevel(method)]
		) {
			Logger.#beforeLogHook?.();
			// eslint-disable-next-line no-console
			(console[method] as (...args: unknown[]) => unknown).apply(console, args);
			Logger.#afterLogHook?.();
		}
	}

	get once() {
		return {
			info: (...args: unknown[]) => this.doLogOnce("info", args),
			log: (...args: unknown[]) => this.doLogOnce("log", args),
			warn: (...args: unknown[]) => this.doLogOnce("warn", args),
			error: (...args: unknown[]) => this.doLogOnce("error", args),
		};
	}

	clearHistory() {
		this.onceHistory.clear();
	}

	doLogOnce(messageLevel: Exclude<LoggerLevel, "none">, args: unknown[]) {
		const cacheKey = `${messageLevel}: ${args.join(" ")}`;

		if (!this.onceHistory.has(cacheKey)) {
			this.onceHistory.add(cacheKey);
			this.doLog(messageLevel, args);
		}
	}

	private doLog(
		messageLevel: Exclude<LoggerLevel, "none">,
		args: unknown[] | string
	) {
		const message = Array.isArray(args)
			? this.formatMessage(messageLevel, format(...args))
			: args;

		// unless in unit-tests, send ALL logs to the debug log file (even non-debug logs for context & order)
		const inUnitTests = typeof vitest !== "undefined";
		if (!inUnitTests) {
			void appendToDebugLogFile(messageLevel, message);
		}

		// only send logs to the terminal if their level is at least the configured log-level
		if (LOGGER_LEVELS[this.loggerLevel] >= LOGGER_LEVELS[messageLevel]) {
			Logger.#beforeLogHook?.();
			// eslint-disable-next-line no-console
			console[messageLevel](message);
			Logger.#afterLogHook?.();
		}
	}

	static #beforeLogHook: (() => void) | undefined;
	static registerBeforeLogHook(callback: (() => void) | undefined) {
		this.#beforeLogHook = callback;
	}
	static #afterLogHook: (() => void) | undefined;
	static registerAfterLogHook(callback: (() => void) | undefined) {
		this.#afterLogHook = callback;
	}

	private formatMessage(
		level: Exclude<LoggerLevel, "none">,
		message: string
	): string {
		const kind = LOGGER_LEVEL_FORMAT_TYPE_MAP[level];
		if (kind) {
			// Format the message using the esbuild formatter.
			// The first line of the message is the main `text`,
			// subsequent lines are put into the `notes`.
			const [firstLine, ...otherLines] = message.split("\n");
			const notes =
				otherLines.length > 0
					? otherLines.map((text) => ({ text }))
					: undefined;
			return formatMessagesSync([{ text: firstLine, notes }], {
				color: true,
				kind,
				terminalWidth: this.columns,
			})[0];
		} else {
			return message;
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

export function logBuildWarnings(warnings: Message[]) {
	const logs = formatMessagesSync(warnings, { kind: "warning", color: true });
	for (const log of logs) {
		logger.console("warn", log);
	}
}

/**
 * Logs all errors/warnings associated with an esbuild BuildFailure in the same
 * style esbuild would.
 */
export function logBuildFailure(errors: Message[], warnings: Message[]) {
	if (errors.length > 0) {
		const logs = formatMessagesSync(errors, { kind: "error", color: true });
		const errorStr = errors.length > 1 ? "errors" : "error";
		logger.error(
			`Build failed with ${errors.length} ${errorStr}:\n` + logs.join("\n")
		);
	}

	logBuildWarnings(warnings);
}

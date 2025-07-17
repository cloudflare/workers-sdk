import path from "path";
import { Colorize, dim, green, grey, red, reset, yellow } from "kleur/colors";
import { LogLevel } from "../workers";

const cwd = process.cwd();
const cwdNodeModules = path.join(cwd, "node_modules");

const LEVEL_PREFIX: { [key in LogLevel]: string } = {
	[LogLevel.NONE]: "",
	[LogLevel.ERROR]: "error",
	[LogLevel.WARN]: "warn",
	[LogLevel.INFO]: "info",
	[LogLevel.DEBUG]: "debug",
	[LogLevel.VERBOSE]: "verbose",
};

const LEVEL_COLOUR: { [key in LogLevel]: Colorize } = {
	[LogLevel.NONE]: reset,
	[LogLevel.ERROR]: red,
	[LogLevel.WARN]: yellow,
	[LogLevel.INFO]: green,
	[LogLevel.DEBUG]: grey,
	[LogLevel.VERBOSE]: (input) => dim(grey(input as any)) as any,
};

export function prefixError(prefix: string, e: any): Error {
	if (e.stack) {
		return new Proxy(e, {
			get(target, propertyKey, receiver) {
				const value = Reflect.get(target, propertyKey, receiver);
				return propertyKey === "stack" ? `${prefix}: ${value}` : value;
			},
		});
	}
	return e;
}

// Regex matches V8 stack frame lines with and without function name:
//   at fnName (location)
const frameRegex = /^\s*at\s+[^\s]+\s+\((.+?)\)$/;
/**
 * Processes a stack trace by applying a custom frame transformer.
 * The transformer receives each frame line and its location (file:line:column);
 * if it returns null, that frame is dropped; otherwise its return value replaces the line.
 */
export function processStackTrace(
	stack: string,
	transformFrame: (line: string, location: string) => string | null
): string {
	const lines = stack.split("\n");
	const result: string[] = [];

	for (const line of lines) {
		const match = frameRegex.exec(line);

		if (match) {
			const location = match[1];
			const transformed = transformFrame(line, location);
			if (transformed !== null) {
				result.push(transformed);
			}

			continue; // if transformed is null, drop the frame
		}

		// Non-frame lines (e.g., error message) are preserved
		result.push(line);
	}

	return result.join("\n");
}

/**
 * Format an error into a string, including the error cause if available.
 *
 * @example
 * ```
 * Error: Something went wrong
 *    at Object.<anonymous> (/path/to/file.js:10:15)
 * Caused by: Error: Another error
 *   at Object.<anonymous> (/path/to/another-file.js:5:10)
 * ```
 */
export function formatError(error: Error): string {
	let message: string;

	if (error.stack) {
		message = processStackTrace(error.stack, (line) => {
			if (!line.includes(cwd) || line.includes(cwdNodeModules)) {
				// Dim internal stack trace lines to highlight user code
				return dim(line);
			}

			return line;
		});
	} else {
		message = error.toString();
	}

	if (error.cause instanceof Error) {
		message += `\nCaused by: ${formatError(error.cause)}`;
	}

	return message;
}

export interface LogOptions {
	prefix?: string;
	suffix?: string;
}

export class Log {
	readonly #prefix: string;
	readonly #suffix: string;

	constructor(
		readonly level = LogLevel.INFO,
		opts: LogOptions = {}
	) {
		const prefix = opts.prefix ?? "mf";
		const suffix = opts.suffix ?? "";
		// If prefix/suffix set, add colon at end/start
		this.#prefix = prefix ? prefix + ":" : "";
		this.#suffix = suffix ? ":" + suffix : "";
	}

	protected log(message: string): void {
		Log.#beforeLogHook?.();
		// eslint-disable-next-line no-console
		console.log(message);
		Log.#afterLogHook?.();
	}

	static #beforeLogHook: (() => void) | undefined;
	static unstable_registerBeforeLogHook(callback: (() => void) | undefined) {
		this.#beforeLogHook = callback;
	}
	static #afterLogHook: (() => void) | undefined;
	static unstable_registerAfterLogHook(callback: (() => void) | undefined) {
		this.#afterLogHook = callback;
	}

	logWithLevel(level: LogLevel, message: string): void {
		if (level <= this.level) {
			const prefix = `[${this.#prefix}${LEVEL_PREFIX[level]}${this.#suffix}]`;
			this.log(`${LEVEL_COLOUR[level](prefix)} ${message}`);
		}
	}

	logReady(message: string): void {
		this.info(message);
	}

	error(message: Error): void {
		if (this.level < LogLevel.ERROR) {
			// Ignore message if it won't get logged
		} else {
			this.logWithLevel(LogLevel.ERROR, formatError(message));
		}
	}

	warn(message: string): void {
		this.logWithLevel(LogLevel.WARN, message);
	}

	info(message: string): void {
		this.logWithLevel(LogLevel.INFO, message);
	}

	debug(message: string): void {
		this.logWithLevel(LogLevel.DEBUG, message);
	}

	verbose(message: string): void {
		this.logWithLevel(LogLevel.VERBOSE, message);
	}
}

export class NoOpLog extends Log {
	constructor() {
		super(LogLevel.NONE);
	}

	protected log(): void {}

	error(_message: Error): void {}
}

// Adapted from https://github.com/chalk/ansi-regex/blob/02fa893d619d3da85411acc8fd4e2eea0e95a9d9/index.js
/*!
 * MIT License
 *
 * Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
const ansiRegexpPattern = [
	"[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
	"(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))",
].join("|");
const ansiRegexp = new RegExp(ansiRegexpPattern, "g");
export function stripAnsi(value: string) {
	return value.replace(ansiRegexp, "");
}

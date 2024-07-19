import path from "path";
import { Colorize, dim, green, grey, red, reset, yellow } from "kleur/colors";
import { LogLevel } from "../workers";

const cwd = process.cwd();
const cwdNodeModules = path.join(cwd, "node_modules");

const LEVEL_PREFIX: { [key in LogLevel]: string } = {
	[LogLevel.NONE]: "",
	[LogLevel.ERROR]: "err",
	[LogLevel.WARN]: "wrn",
	[LogLevel.INFO]: "inf",
	[LogLevel.DEBUG]: "dbg",
	[LogLevel.VERBOSE]: "vrb",
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

function dimInternalStackLine(line: string): string {
	if (
		line.startsWith("    at") &&
		(!line.includes(cwd) || line.includes(cwdNodeModules))
	) {
		return dim(line);
	}
	return line;
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
			this.log(LEVEL_COLOUR[level](`${prefix} ${message}`));
		}
	}

	error(message: Error): void {
		if (this.level < LogLevel.ERROR) {
			// Ignore message if it won't get logged
		} else if (message.stack) {
			// Dim internal stack trace lines to highlight user code
			const lines = message.stack.split("\n").map(dimInternalStackLine);
			this.logWithLevel(LogLevel.ERROR, lines.join("\n"));
		} else {
			this.logWithLevel(LogLevel.ERROR, message.toString());
		}
		if ((message as any).cause) {
			this.error(prefixError("Cause", (message as any).cause));
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

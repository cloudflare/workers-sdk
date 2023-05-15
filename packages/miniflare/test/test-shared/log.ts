import { ExecutionContext } from "ava";
import { Log, LogLevel } from "miniflare";

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
function stripAnsi(value: string) {
	return value.replace(ansiRegexp, "");
}

const consoleLog = new Log(LogLevel.VERBOSE);

export type LogEntry = [level: LogLevel, message: string];
export class TestLog extends Log {
	logs: LogEntry[] = [];

	constructor(private readonly t?: ExecutionContext) {
		super(LogLevel.VERBOSE);
	}

	log(message: string): void {
		this.logs.push([LogLevel.NONE, stripAnsi(message)]);
	}

	logWithLevel(level: LogLevel, message: string): void {
		this.logs.push([level, stripAnsi(message)]);
	}

	error(message: Error): void {
		if (this.t === undefined) {
			throw message;
		} else {
			consoleLog.error(message);
			this.t.fail(message.stack);
		}
	}

	logsAtLevel(level: LogLevel): string[] {
		return this.logs
			.filter(([logLevel]) => logLevel === level)
			.map(([, message]) => message);
	}
}

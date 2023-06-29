import http from "http";
import path from "path";
import {
	Colorize,
	blue,
	bold,
	dim,
	green,
	grey,
	red,
	reset,
	yellow,
} from "kleur/colors";
import { z } from "zod";
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
		console.log(message);
	}

	protected logWithLevel(level: LogLevel, message: string): void {
		if (level <= this.level) {
			const prefix = `[${this.#prefix}${LEVEL_PREFIX[level]}${this.#suffix}]`;
			this.log(LEVEL_COLOUR[level](`${prefix} ${message}`));
		}
	}

	error(message: Error): void {
		if (this.level < LogLevel.ERROR) {
			// Rethrow message if it won't get logged
			throw message;
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

	error(message: Error): void {
		throw message;
	}
}

export const ResponseInfoSchema = z.object({
	status: z.number(),
	statusText: z.string(),
	method: z.string(),
	url: z.string(),
	time: z.number(),
});
export type ResponseInfo = z.infer<typeof ResponseInfoSchema>;

export async function formatResponse(info: ResponseInfo) {
	const url = new URL(info.url);

	const statusText = info.statusText.trim() || http.STATUS_CODES[info.status];
	const lines = [
		`${bold(info.method)} ${url.pathname} `,
		colourFromHTTPStatus(info.status)(`${bold(info.status)} ${statusText} `),
		grey(`(${info.time}ms)`),
	];
	return reset(lines.join(""));
}

function colourFromHTTPStatus(status: number): Colorize {
	if (200 <= status && status < 300) return green;
	if (400 <= status && status < 500) return yellow;
	if (500 <= status) return red;
	return blue;
}

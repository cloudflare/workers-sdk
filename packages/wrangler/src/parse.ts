import * as fs from "node:fs";
import { resolve } from "node:path";
import TOML from "@iarna/toml";
import { formatMessagesSync } from "esbuild";
import * as jsoncParser from "jsonc-parser";
import { UserError } from "./errors";
import { logger } from "./logger";
import type { TelemetryMessage } from "./errors";
import type { ParseError as JsoncParseError } from "jsonc-parser";

export type Message = {
	text: string;
	location?: Location;
	notes?: Message[];
	kind?: "warning" | "error";
} & TelemetryMessage;

export type Location = File & {
	line: number;
	column: number;
	length?: number;
	lineText?: string;
	suggestion?: string;
};

export type File = {
	file?: string;
	fileText?: string;
};

/**
 * Formats a `Message` using esbuild's pretty-printing algorithm.
 */
export function formatMessage(
	{ text, notes, location, kind = "error" }: Message,
	color = true
): string {
	const input = { text, notes, location };
	delete input.location?.fileText;
	for (const note of notes ?? []) {
		delete note.location?.fileText;
	}
	const lines = formatMessagesSync([input], {
		color,
		kind: kind,
		terminalWidth: logger.columns,
	});
	return lines.join("\n");
}

/**
 * An error that's thrown when something fails to parse.
 */
export class ParseError extends UserError implements Message {
	readonly text: string;
	readonly notes: Message[];
	readonly location?: Location;
	readonly kind: "warning" | "error";

	constructor({ text, notes, location, kind, telemetryMessage }: Message) {
		super(text, { telemetryMessage });
		this.name = this.constructor.name;
		this.text = text;
		this.notes = notes ?? [];
		this.location = location;
		this.kind = kind ?? "error";
	}
}

// `ParseError`s shouldn't generally be reported to Sentry, but Wrangler has
// relied on `ParseError` for any sort of error with additional notes.
// In particular, API errors which we'd like to report are `ParseError`s.
// Therefore, allow particular `ParseError`s to be marked `reportable`.
export class APIError extends ParseError {
	#status?: number;
	code?: number;
	accountTag?: string;

	constructor({ status, ...rest }: Message & { status?: number }) {
		super(rest);
		this.name = this.constructor.name;
		this.#status = status;
	}

	isGatewayError() {
		if (this.#status !== undefined) {
			return [524].includes(this.#status);
		}
		return false;
	}

	isRetryable() {
		return String(this.#status).startsWith("5");
	}

	// Allow `APIError`s to be marked as handled.
	#reportable = true;
	get reportable() {
		return this.#reportable;
	}
	preventReport() {
		this.#reportable = false;
	}
}

const TOML_ERROR_NAME = "TomlError";
const TOML_ERROR_SUFFIX = " at row ";

type TomlError = Error & {
	line: number;
	col: number;
};

/**
 * A wrapper around `TOML.parse` that throws a `ParseError`.
 */
export function parseTOML(input: string, file?: string): TOML.JsonMap | never {
	try {
		// Normalize CRLF to LF to avoid hitting https://github.com/iarna/iarna-toml/issues/33.
		const normalizedInput = input.replace(/\r\n/g, "\n");
		return TOML.parse(normalizedInput);
	} catch (err) {
		const { name, message, line, col } = err as TomlError;
		if (name !== TOML_ERROR_NAME) {
			throw err;
		}
		const text = message.substring(0, message.lastIndexOf(TOML_ERROR_SUFFIX));
		const lineText = input.split("\n")[line];
		const location = {
			lineText,
			line: line + 1,
			column: col - 1,
			file,
			fileText: input,
		};
		throw new ParseError({
			text,
			location,
			telemetryMessage: "TOML parse error",
		});
	}
}

/**
 * A minimal type describing a package.json file.
 */
export type PackageJSON = {
	devDependencies?: Record<string, unknown>;
	dependencies?: Record<string, unknown>;
	scripts?: Record<string, unknown>;
};

/**
 * A typed version of `parseJSON()`.
 */
export function parsePackageJSON(input: string, file?: string): PackageJSON {
	return parseJSON(input, file) as PackageJSON;
}

/**
 * Parses JSON and throws a `ParseError`.
 */
export function parseJSON(input: string, file?: string): unknown {
	return parseJSONC(input, file, {
		allowEmptyContent: false,
		allowTrailingComma: false,
		disallowComments: true,
	});
}

/**
 * A wrapper around `JSONC.parse` that throws a `ParseError`.
 */
export function parseJSONC(
	input: string,
	file?: string,
	options: jsoncParser.ParseOptions = { allowTrailingComma: true }
): unknown {
	const errors: JsoncParseError[] = [];
	const data = jsoncParser.parse(input, errors, options);
	if (errors.length) {
		throw new ParseError({
			text: jsoncParser.printParseErrorCode(errors[0].error),
			location: {
				...indexLocation({ file, fileText: input }, errors[0].offset + 1),
				length: errors[0].length,
			},
			telemetryMessage: "JSON(C) parse error",
		});
	}
	return data;
}

/**
 * Reads a file into a node Buffer.
 */
export function readFileSyncToBuffer(file: string): Buffer {
	try {
		return fs.readFileSync(file);
	} catch (err) {
		const { message } = err as Error;
		throw new ParseError({
			text: `Could not read file: ${file}`,
			notes: [
				{
					text: message.replace(file, resolve(file)),
				},
			],
		});
	}
}

/**
 * Reads a file and parses it based on its type.
 */
export function readFileSync(file: string): string {
	try {
		return fs.readFileSync(file, { encoding: "utf-8" });
	} catch (err) {
		const { message } = err as Error;
		throw new ParseError({
			text: `Could not read file: ${file}`,
			notes: [
				{
					text: message.replace(file, resolve(file)),
				},
			],
			telemetryMessage: "Could not read file",
		});
	}
}

/**
 * Calculates the line and column location from an index.
 */
export function indexLocation(file: File, index: number): Location {
	let lineText,
		line = 0,
		column = 0,
		cursor = 0;
	const { fileText = "" } = file;
	for (const row of fileText.split("\n")) {
		line++;
		cursor += row.length + 1;
		if (cursor >= index) {
			lineText = row;
			column = row.length - (cursor - index);
			break;
		}
	}
	return { lineText, line, column, ...file };
}

/**
 * Guesses the line and column location of a search query.
 */
export function searchLocation(file: File, query: unknown): Location {
	let lineText,
		length,
		line = 0,
		column = 0;
	const queryText = String(query);
	const { fileText = "" } = file;
	for (const content of fileText.split("\n")) {
		line++;
		const index = content.indexOf(queryText);
		if (index >= 0) {
			lineText = content;
			column = index;
			length = queryText.length;
			break;
		}
	}
	return { lineText, line, column, length, ...file };
}

const units = {
	nanoseconds: 0.000000001,
	nanosecond: 0.000000001,
	microseconds: 0.000001,
	microsecond: 0.000001,
	milliseconds: 0.001,
	millisecond: 0.001,
	seconds: 1,
	second: 1,
	minutes: 60,
	minute: 60,
	hours: 3600,
	hour: 3600,
	days: 86400,
	day: 86400,
	weeks: 604800,
	week: 604800,
	month: 18144000,
	year: 220752000,

	nsecs: 0.000000001,
	nsec: 0.000000001,
	usecs: 0.000001,
	usec: 0.000001,
	msecs: 0.001,
	msec: 0.001,
	secs: 1,
	sec: 1,
	mins: 60,
	min: 60,

	ns: 0.000000001,
	us: 0.000001,
	ms: 0.001,
	mo: 18144000,
	yr: 220752000,

	s: 1,
	m: 60,
	h: 3600,
	d: 86400,
	w: 604800,
	y: 220752000,
};

/**
 * Parse a human-readable time duration in seconds (including fractional)
 *
 * Invalid values will return NaN
 */
export function parseHumanDuration(s: string): number {
	const unitsMap = new Map(Object.entries(units));
	s = s.trim().toLowerCase();
	let base = 1;
	for (const [name, _] of unitsMap) {
		if (s.endsWith(name)) {
			s = s.substring(0, s.length - name.length);
			base = unitsMap.get(name) || 1;
			break;
		}
	}
	return Number(s) * base;
}

export function parseNonHyphenedUuid(uuid: string | null): string | null {
	if (uuid == null || uuid.includes("-")) {
		return uuid;
	}

	if (uuid.length != 32) {
		return null;
	}

	const uuid_parts: string[] = [];
	uuid_parts.push(uuid.slice(0, 8));
	uuid_parts.push(uuid.slice(8, 12));
	uuid_parts.push(uuid.slice(12, 16));
	uuid_parts.push(uuid.slice(16, 20));
	uuid_parts.push(uuid.slice(20));

	let hyphenated = "";
	uuid_parts.forEach((part) => (hyphenated += part + "-"));

	return hyphenated.slice(0, 36);
}

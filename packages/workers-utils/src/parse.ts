import { readFileSync as fsReadFileSync } from "node:fs";
import { resolve } from "node:path";
import * as jsoncParser from "jsonc-parser";
import TOML, { TomlError } from "smol-toml";
import { UserError } from "./errors";
import type { TelemetryMessage } from "./errors";
import type { ParseError as JsoncParseError } from "jsonc-parser";

export type Message = {
	text: string;
	location?: Location;
	notes?: Message[];
	kind?: "warning" | "error";
} & TelemetryMessage;

export type Location = ParseFile & {
	line: number;
	column: number;
	length?: number;
	lineText?: string;
	suggestion?: string;
};

export type ParseFile = {
	file?: string;
	fileText?: string;
};

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

/**
 * Parses a TOML string to an object.
 *
 * Note: throws a `ParseError` if parsing fails.
 *
 * @param tomlContent The TOML content to parse.
 * @param filePath Optional file path for error reporting.
 * @returns The parsed TOML object.
 */
export function parseTOML(tomlContent: string, filePath?: string): unknown {
	try {
		return TOML.parse(tomlContent);
	} catch (err) {
		if (!(err instanceof TomlError)) {
			throw err;
		}

		const location = {
			lineText: tomlContent.split("\n")[err.line - 1],
			line: err.line,
			column: err.column - 1,
			file: filePath,
			fileText: tomlContent,
		};
		throw new ParseError({
			text: err.message.substring(0, err.message.indexOf("\n")),
			location,
			telemetryMessage: "TOML parse error",
		});
	}
}

/**
 * A minimal type describing a package.json file.
 */
export type PackageJSON = {
	name?: string;
	version?: string;
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
		return fsReadFileSync(file);
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
		const buffer = fsReadFileSync(file);
		return removeBOMAndValidate(buffer, file);
	} catch (err) {
		if (err instanceof ParseError) {
			throw err;
		}

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
export function indexLocation(file: ParseFile, index: number): Location {
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
export function searchLocation(file: ParseFile, query: unknown): Location {
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

export function parseByteSize(
	s: string,
	base: number | undefined = undefined
): number {
	const match = s.match(
		/^(\d*\.*\d*)\s*([kKmMgGtTpP]{0,1})([i]{0,1}[bB]{0,1})$/
	);
	if (!match) {
		return NaN;
	}

	const size = match[1];
	if (size.length === 0 || isNaN(Number(size))) {
		return NaN;
	}

	const unit = match[2].toLowerCase();
	const sizeUnits = {
		k: 1,
		m: 2,
		g: 3,
		t: 4,
		p: 5,
	} as const;
	if (unit.length !== 0 && !(unit in sizeUnits)) {
		return NaN;
	}

	const binary = match[3].toLowerCase() == "ib";
	if (binary && unit.length === 0) {
		// Plain "ib" without a size unit is invalid
		return NaN;
	}

	const pow = sizeUnits[unit as keyof typeof sizeUnits] || 0;

	return Math.floor(
		Number(size) * Math.pow(base ?? (binary ? 1024 : 1000), pow)
	);
}

const UNSUPPORTED_BOMS = [
	{
		buffer: Buffer.from([0x00, 0x00, 0xfe, 0xff]),
		encoding: "UTF-32 BE",
	},
	{
		buffer: Buffer.from([0xff, 0xfe, 0x00, 0x00]),
		encoding: "UTF-32 LE",
	},
	{
		buffer: Buffer.from([0xfe, 0xff]),
		encoding: "UTF-16 BE",
	},
	{
		buffer: Buffer.from([0xff, 0xfe]),
		encoding: "UTF-16 LE",
	},
];

/**
 * Removes UTF-8 BOM if present and validates that no other BOMs are present.
 * Throws ParseError for non-UTF-8 BOMs with descriptive error messages.
 */
function removeBOMAndValidate(buffer: Buffer, file: string): string {
	for (const bom of UNSUPPORTED_BOMS) {
		if (
			buffer.length >= bom.buffer.length &&
			buffer.subarray(0, bom.buffer.length).equals(bom.buffer)
		) {
			throw new ParseError({
				text: `Configuration file contains ${bom.encoding} byte order marker`,
				notes: [
					{
						text: `The file "${file}" appears to be encoded as ${bom.encoding}. Please save the file as UTF-8 without BOM.`,
					},
				],
				location: { file, line: 1, column: 0 },
				telemetryMessage: `${bom.encoding} BOM detected`,
			});
		}
	}

	const content = buffer.toString("utf-8");

	if (content.charCodeAt(0) === 0xfeff) {
		return content.slice(1);
	}

	return content;
}

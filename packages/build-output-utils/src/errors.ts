import type { ParsedBuildOutputProducer } from "@cloudflare/config";

const BUILD_OUTPUT_ERROR_PREFIX = "Build Output Specification: ";

/**
 * Why reading a Build Output Specification tree failed.
 *
 * - `not-found`: there is no version directory under `.cloudflare/output/`.
 * - `newer-version`: the tree uses a newer format than this reader supports.
 * - `older-version`: the tree uses an older format than this reader supports.
 * - `multiple-versions`: more than one version directory was found.
 * - `unknown-fields`: a file contains fields this reader doesn't support.
 * - `invalid`: the tree is malformed or internally inconsistent.
 */
export type BuildOutputErrorCode =
	| "not-found"
	| "newer-version"
	| "older-version"
	| "multiple-versions"
	| "unknown-fields"
	| "invalid";

/** A field this reader doesn't support. */
export interface BuildOutputUnknownField {
	/** Path of the file, relative to `.cloudflare/output/`, using `/` separators. */
	file: string;
	/** Dot-separated JSON path of the field within the file. */
	path: string;
}

/** Structured details attached to a {@link BuildOutputError}. */
export interface BuildOutputErrorOptions {
	/** Defaults to `"invalid"`. */
	code?: BuildOutputErrorCode;
	/** The version directories found, such as `["v2"]` or `["v0", "v1"]`. */
	foundVersions?: string[];
	/** The version directories this reader supports. */
	supportedVersions?: string[];
	/** The tool that wrote the tree, when it was recorded. */
	producer?: ParsedBuildOutputProducer;
	/** The fields this reader doesn't support. */
	unknownFields?: BuildOutputUnknownField[];
}

/**
 * Thrown when the Build Output Specification tree is missing, malformed,
 * internally inconsistent, or in a format this reader doesn't support.
 *
 * The message is neutral about which tool is reading the tree. Consumers can
 * use `code` and the other fields to render their own advice instead of
 * parsing the message.
 */
export class BuildOutputError extends Error {
	readonly code: BuildOutputErrorCode;
	readonly foundVersions?: string[];
	readonly supportedVersions?: string[];
	readonly producer?: ParsedBuildOutputProducer;
	readonly unknownFields?: BuildOutputUnknownField[];

	constructor(message: string, options: BuildOutputErrorOptions = {}) {
		super(`${BUILD_OUTPUT_ERROR_PREFIX}${message}`);
		this.name = "BuildOutputError";
		this.code = options.code ?? "invalid";
		this.foundVersions = options.foundVersions;
		this.supportedVersions = options.supportedVersions;
		this.producer = options.producer;
		this.unknownFields = options.unknownFields;
	}
}

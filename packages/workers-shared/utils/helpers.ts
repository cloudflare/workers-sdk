import { readFileSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";
import ignore from "ignore";
import mime from "mime";
import {
	CF_ASSETS_IGNORE_FILENAME,
	HEADERS_FILENAME,
	REDIRECTS_FILENAME,
} from "./constants";
import type { PathOrFileDescriptor } from "node:fs";

/** normalises sep for windows and prefix with `/` */
export const normalizeFilePath = (relativeFilepath: string) => {
	if (isAbsolute(relativeFilepath)) {
		throw new Error(`Expected relative path`);
	}
	return "/" + relativeFilepath.split(sep).join("/");
};

export const getContentType = (absFilePath: string) => {
	let contentType = mime.getType(absFilePath);
	if (
		contentType &&
		contentType.startsWith("text/") &&
		!contentType.includes("charset")
	) {
		contentType = `${contentType}; charset=utf-8`;
	}
	return contentType;
};

/**
 * Generate a function that can match relative filepaths against a list of gitignore formatted patterns.
 */
export function createPatternMatcher(
	patterns: string[],
	exclude: boolean
): (filePath: string) => boolean {
	if (patterns.length === 0) {
		return (_filePath) => !exclude;
	} else {
		const ignorer = ignore().add(patterns);
		return (filePath) => ignorer.test(filePath).ignored;
	}
}

export function thrownIsDoesNotExistError(
	thrown: unknown
): thrown is Error & { code: "ENOENT" } {
	return (
		thrown instanceof Error && "code" in thrown && thrown.code === "ENOENT"
	);
}

export function maybeGetFile(filePath: PathOrFileDescriptor) {
	try {
		return readFileSync(filePath, "utf8");
	} catch (e: unknown) {
		if (!thrownIsDoesNotExistError(e)) {
			throw e;
		}
	}
}

/** An ignore file whose encoding cannot be used to match asset paths. */
export class InvalidAssetsIgnoreError extends Error {
	constructor(filePath: string) {
		super(
			`The .assetsignore file at "${filePath}" must be UTF-8 encoded and must not contain null characters. Save the file as UTF-8 and try again.`
		);
		this.name = "InvalidAssetsIgnoreError";
	}
}

/** Read ignore patterns without silently replacing undecodable characters. */
function readAssetsIgnoreFile(filePath: string): string | undefined {
	let contents: Buffer;
	try {
		contents = readFileSync(filePath);
	} catch (error) {
		if (thrownIsDoesNotExistError(error)) {
			return;
		}
		throw error;
	}

	try {
		const text = new TextDecoder("utf-8", { fatal: true }).decode(contents);
		// BOM-less UTF-16 can be valid UTF-8 bytes but cannot form usable patterns.
		if (text.includes("\0")) {
			throw new Error("Ignore patterns contain a null character.");
		}
		return text;
	} catch {
		throw new InvalidAssetsIgnoreError(filePath);
	}
}

/**
 * Create a function for filtering out ignored assets.
 *
 * The generated function takes an asset path, relative to the asset directory,
 * and returns true if the asset should not be ignored.
 */
export async function createAssetsIgnoreFunction(dir: string) {
	const cfAssetIgnorePath = resolve(dir, CF_ASSETS_IGNORE_FILENAME);

	const ignorePatterns = [
		// Ignore the `.assetsignore` file and other metafiles by default.
		// The ignore lib expects unix-style paths for its patterns
		`/${CF_ASSETS_IGNORE_FILENAME}`,
		`/${REDIRECTS_FILENAME}`,
		`/${HEADERS_FILENAME}`,
	];

	let assetsIgnoreFilePresent = false;
	const assetsIgnore = readAssetsIgnoreFile(cfAssetIgnorePath);
	if (assetsIgnore !== undefined) {
		assetsIgnoreFilePresent = true;
		ignorePatterns.push(...assetsIgnore.split("\n"));
	}

	return {
		assetsIgnoreFunction: createPatternMatcher(ignorePatterns, true),
		assetsIgnoreFilePresent,
	};
}

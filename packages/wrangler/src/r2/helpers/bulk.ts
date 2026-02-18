import fs from "node:fs";
import {
	isRequiredProperty,
	readFileSync,
	UserError,
} from "@cloudflare/workers-utils";
import prettyBytes from "pretty-bytes";
import { logger } from "../../logger";
import { MAX_UPLOAD_SIZE_BYTES } from "../constants";

/**
 * Validates the file to be used for bulk put operations.
 *
 * The file is a list of {key, file} in JSON format.
 *
 * This functions throws a `UserError`:
 * - when the file does not exist
 * - when the file is not readable
 * - when the file is not a valid JSON
 * - when the file content is not an array of {key, file} objects
 * - when any of the `file` entries is not a file that exists
 * - when any of the `file` entries exceeds the maximum upload size
 *
 * @param filename The path to the bulk put JSON file
 * @returns
 */
export function validateBulkPutFile(
	filename: string
): { key: string; file: string; size: number }[] {
	if (!fs.existsSync(filename)) {
		throw new UserError(`The file "${filename}" does not exist.`);
	}

	let fileContent: string;
	try {
		fileContent = readFileSync(filename);
	} catch {
		throw new UserError(`The file "${filename}" is not readable.`);
	}

	// The `size` property is added in the for loop below
	let entries: { key: string; file: string; size: number }[];
	try {
		entries = JSON.parse(fileContent);
	} catch {
		throw new UserError(`The file "${filename}" is not a valid JSON.`);
	}

	if (!Array.isArray(entries)) {
		throw new UserError(
			`The file "${filename}" must contain an array of entries.`
		);
	}

	for (const entry of entries) {
		if (
			entry === null ||
			typeof entry !== "object" ||
			!isRequiredProperty(entry, "key", "string") ||
			!isRequiredProperty(entry, "file", "string")
		) {
			throw new UserError(
				`Each entry in the file "${filename}" must be an object with "key" and "file" string properties.`
			);
		}

		if (!fs.existsSync(entry.file)) {
			throw new UserError(`The file "${entry.file}" does not exist.`);
		}

		const stat = fs.statSync(entry.file, { throwIfNoEntry: false });
		if (!stat?.isFile()) {
			throw new UserError(`The path "${entry.file}" is not a file.`);
		}

		if (stat.size > MAX_UPLOAD_SIZE_BYTES) {
			throw new UserError(
				`The file "${entry.file}" exceeds the maximum upload size of ${prettyBytes(
					MAX_UPLOAD_SIZE_BYTES,
					{ binary: true }
				)}.`
			);
		}

		entry.size = stat.size;
	}

	return entries;
}

/**
 * Formatter for converting e.g. 5328 --> 5,328
 */
const formatNumber = new Intl.NumberFormat("en-US", {
	notation: "standard",
}).format;

/**
 * Helper function for bulk requests, logs ongoing output to console.
 */
export function logBulkProgress(label: string, index: number, total: number) {
	logger.log(
		`${label} ${Math.floor(
			(100 * index) / total
		)}% (${formatNumber(index)} out of ${formatNumber(total)})`
	);
}

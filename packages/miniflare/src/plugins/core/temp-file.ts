import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Writes text content to a randomly named file under the instance temp
 * directory, optionally grouped into a `prefix` subdirectory, and returns the
 * path it was written to.
 *
 * This backs the `/core/store-temp-file` loopback endpoint. Callers that need
 * the email layout instead should use `writeEmailTempFile`.
 */
export async function writeTempFile(options: {
	tmpPath: string;
	prefix: string | null;
	extension: string;
	contents: string;
}): Promise<string> {
	if (
		(options.prefix !== null &&
			(options.prefix === "." ||
				options.prefix === ".." ||
				options.prefix.includes("/") ||
				options.prefix.includes("\\"))) ||
		options.extension.includes("/") ||
		options.extension.includes("\\")
	) {
		throw new Error("Invalid temporary-file path component");
	}
	const folder = options.prefix ? `files/${options.prefix}` : "files";
	const directory = path.join(options.tmpPath, folder);
	await mkdir(directory, { recursive: true });

	const filePath = path.resolve(
		directory,
		`${crypto.randomUUID()}.${options.extension}`
	);
	const root = path.resolve(directory);
	if (!filePath.startsWith(`${root}${path.sep}`)) {
		throw new Error("Invalid temporary-file path");
	}
	await writeFile(filePath, options.contents);
	return filePath;
}

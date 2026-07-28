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
	const folder = options.prefix ? `files/${options.prefix}` : "files";
	const directory = path.join(options.tmpPath, folder);
	await mkdir(directory, { recursive: true });

	const filePath = path.join(
		directory,
		`${crypto.randomUUID()}.${options.extension}`
	);
	await writeFile(filePath, options.contents);
	return filePath;
}

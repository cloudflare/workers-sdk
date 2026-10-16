import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Writes content under a caller-provided relative prefix and returns the path.
 *
 * Callers own the destination layout. This keeps the helper usable for regular,
 * email, and other temp-file consumers without embedding product-specific rules.
 */
export async function writeTempFile(options: {
	tmpPath: string;
	prefix: string;
	fileName: string;
	contents: string | Uint8Array;
}): Promise<string> {
	const prefixParts = options.prefix.split("/");
	if (
		prefixParts.some(
			(part) =>
				part.length === 0 ||
				part === "." ||
				part === ".." ||
				!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(part)
		)
	) {
		throw new Error("Invalid temporary-file prefix");
	}

	const directory = path.join(options.tmpPath, ...prefixParts);
	await mkdir(directory, { recursive: true });
	const root = path.resolve(directory);
	const filePath = path.resolve(root, options.fileName);
	if (filePath === root || !filePath.startsWith(`${root}${path.sep}`)) {
		throw new Error("Invalid temporary-file path");
	}
	await writeFile(filePath, options.contents);
	return filePath;
}

import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import path from "node:path";

/** Resolve file and directory symlinks, including a link to a missing file. */
export function resolveFilePath(filePath: string, links = 0): string {
	if (links > 40) {
		throw Object.assign(new Error("Too many file symlinks"), {
			code: "ELOOP",
		});
	}
	const absolutePath = path.resolve(filePath);
	try {
		return realpathSync(absolutePath);
	} catch (error) {
		if (
			!(error instanceof Error && "code" in error && error.code === "ENOENT")
		) {
			throw error;
		}
	}
	if (lstatSync(absolutePath, { throwIfNoEntry: false })?.isSymbolicLink()) {
		return resolveFilePath(
			path.resolve(path.dirname(absolutePath), readlinkSync(absolutePath)),
			links + 1
		);
	}
	const directory = path.dirname(absolutePath);
	return directory === absolutePath
		? absolutePath
		: path.join(resolveFilePath(directory, links), path.basename(absolutePath));
}

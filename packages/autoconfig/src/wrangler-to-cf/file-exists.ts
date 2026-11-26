import { access } from "node:fs/promises";

/**
 * Checks whether a filesystem path exists without suppressing other errors.
 *
 * @param filePath Path to check.
 *
 * @returns Whether the path exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return false;
		}

		throw error;
	}
}

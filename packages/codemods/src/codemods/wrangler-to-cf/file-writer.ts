import { open, unlink, writeFile } from "node:fs/promises";

/**
 * Rewrites an output created by the current migration invocation.
 *
 * @param filePath Absolute path to the generated migration file.
 * @param contents Updated generated contents.
 */
export async function rewriteMigrationOutput(
	filePath: string,
	contents: string
): Promise<void> {
	await writeFile(filePath, contents);
}

/**
 * Writes generated migration files and removes files created by this invocation
 * if a later write fails.
 *
 * @param outputs Absolute file paths mapped to their generated contents.
 */
export async function writeMigrationOutputs(
	outputs: ReadonlyMap<string, string>
): Promise<void> {
	const createdFiles: string[] = [];

	try {
		for (const [filePath, contents] of outputs) {
			const file = await open(filePath, "wx");
			createdFiles.push(filePath);
			try {
				await file.writeFile(contents);
			} finally {
				await file.close();
			}
		}
	} catch (error) {
		const cleanupResults = await Promise.allSettled(
			createdFiles.map((filePath) => unlink(filePath))
		);
		const cleanupErrors = cleanupResults.flatMap((result) =>
			result.status === "rejected" ? [result.reason] : []
		);

		if (cleanupErrors.length > 0) {
			throw new AggregateError(
				[error, ...cleanupErrors],
				"Failed to write migration outputs and clean up partial files."
			);
		}

		throw error;
	}
}

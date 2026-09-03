export function w(
	coverageFilesDirectory: string,
	coverage: unknown
): Promise<string> {
	return globalThis.__vitestWriteCoverageFile({
		coverage,
		coverageFilesDirectory,
	});
}

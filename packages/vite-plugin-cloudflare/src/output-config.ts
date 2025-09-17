import assert from "node:assert";
import * as path from "node:path";
import * as vite from "vite";

export function getAssetsDirectory(
	workerOutputDirectory: string,
	resolvedViteConfig: vite.ResolvedConfig
): string {
	const clientOutputDirectory =
		resolvedViteConfig.environments.client?.build.outDir;

	assert(
		clientOutputDirectory,
		"Unexpected error: client output directory is undefined"
	);

	return path.relative(
		path.resolve(resolvedViteConfig.root, workerOutputDirectory),
		path.resolve(resolvedViteConfig.root, clientOutputDirectory)
	);
}

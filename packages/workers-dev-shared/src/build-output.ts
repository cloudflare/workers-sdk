import * as fs from "node:fs";
import * as path from "node:path";

/** Build Output directory used for the dedicated prerender Worker. */
export const PRERENDER_WORKER_DIRECTORY_NAME = "prerender";

/**
 * Moves assets imported by the entry Worker from its build output to the
 * client build output, so that they are served as static assets.
 *
 * @param importedAssetPaths The assets' paths relative to both directories
 * @param entryWorkerBuildDirectory The entry Worker's build output directory
 * @param clientBuildDirectory The client build output directory
 * @returns The absolute paths of the moved assets
 */
export function moveImportedAssets(
	importedAssetPaths: Iterable<string>,
	entryWorkerBuildDirectory: string,
	clientBuildDirectory: string
): string[] {
	const movedAssetPaths: string[] = [];

	for (const assetPath of importedAssetPaths) {
		const src = path.join(entryWorkerBuildDirectory, assetPath);
		const dest = path.join(clientBuildDirectory, assetPath);

		if (!fs.existsSync(src)) {
			continue;
		}

		if (fs.existsSync(dest)) {
			fs.unlinkSync(src);
		} else {
			const destDir = path.dirname(dest);
			fs.mkdirSync(destDir, { recursive: true });
			fs.renameSync(src, dest);
			movedAssetPaths.push(dest);
		}
	}

	return movedAssetPaths;
}

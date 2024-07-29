import path from "node:path";
import type { Config } from "./config";

/**
 * Returns the base path of the experimental assets to upload.
 *
 */
export function getExperimentalAssetsBasePath(
	config: Config,
	experimentalAssetsDirectory: string | undefined
): string {
	return experimentalAssetsDirectory
		? process.cwd()
		: path.resolve(path.dirname(config.configPath ?? "wrangler.toml"));
}

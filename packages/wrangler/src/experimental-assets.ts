import { existsSync } from "node:fs";
import path from "node:path";
import { UserError } from "./errors";
import type { Config } from "./config";

/**
 * Returns the base path of the experimental assets to upload.
 *
 */
export function getExperimentalAssetsBasePath(
	config: Config,
	experimentalAssetsCommandLineArg: string | undefined
): string {
	return experimentalAssetsCommandLineArg
		? process.cwd()
		: path.resolve(path.dirname(config.configPath ?? "wrangler.toml"));
}

export function processExperimentalAssetsArg(
	args: { experimentalAssets: string | undefined },
	config: Config
) {
	const experimentalAssets = args.experimentalAssets
		? { directory: args.experimentalAssets }
		: config.experimental_assets;
	if (experimentalAssets) {
		const experimentalAssetsBasePath = getExperimentalAssetsBasePath(
			config,
			args.experimentalAssets
		);
		const resolvedExperimentalAssetsPath = path.resolve(
			experimentalAssetsBasePath,
			experimentalAssets.directory
		);

		if (!existsSync(resolvedExperimentalAssetsPath)) {
			const sourceOfTruthMessage = args.experimentalAssets
				? '"--experimental-assets" command line argument'
				: '"experimental_assets.directory" field in your configuration file';

			throw new UserError(
				`The directory specified by the ${sourceOfTruthMessage} does not exist:\n` +
					`${resolvedExperimentalAssetsPath}`
			);
		}

		experimentalAssets.directory = resolvedExperimentalAssetsPath;
	}

	return experimentalAssets;
}

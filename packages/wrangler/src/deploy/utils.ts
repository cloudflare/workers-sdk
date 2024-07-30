import { existsSync } from "node:fs";
import path from "node:path";
import { UserError } from "../errors";
import { getExperimentalAssetsBasePath } from "../experimental-assets";
import type { Config } from "../config";
import type { StrictYargsOptionsToInterface } from "../yargs-types";
import type { deployOptions } from "./index";

export function processExperimentalAssetsArg(
	args: Pick<
		StrictYargsOptionsToInterface<typeof deployOptions>,
		"experimentalAssets"
	>,
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

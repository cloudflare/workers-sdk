import { statSync } from "node:fs";
import * as path from "node:path";
import { resolveAssetOptions } from "@cloudflare/deploy-helpers";
import { UserError } from "@cloudflare/workers-utils";
import { logger } from "./logger";
import { getBasePath } from "./paths";
import type { StartDevWorkerOptions } from "./api";
import type { DeployArgs } from "./deploy";
import type { StartDevOptions } from "./dev";
import type {
	AssetsOptions,
	Config,
	ValidatedAssetsOptions,
} from "@cloudflare/workers-utils";

export { buildAssetManifest, syncAssets } from "@cloudflare/deploy-helpers";
export type { AssetManifest } from "@cloudflare/deploy-helpers";

/**
 * Returns the base path of the assets to upload.
 *
 */
function getAssetsBasePath(
	config: Config,
	assetsCommandLineArg: string | undefined
): string {
	return assetsCommandLineArg
		? process.cwd()
		: path.resolve(path.dirname(config.configPath ?? "wrangler.toml"));
}

export class NonExistentAssetsDirError extends UserError {}

export class NonDirectoryAssetsDirError extends UserError {}

/**
 * Validate and resolve the assets directory.
 *
 * This is the validation half of `getAssetsOptions`: it merges the assets
 * config with CLI args and overrides, validates the `directory` and resolves
 * its absolute path, and checks that the path exists (optionally) and is a
 * directory. The remaining options (router/asset config, _redirects/_headers)
 * are resolved later by `resolveAssetOptions` in `@cloudflare/deploy-helpers`.
 */
export function validateAssetsOptions({
	args,
	config,
	validateDirectoryExistence = true,
	overrides,
}: {
	args: { assets: string | undefined; script?: string };
	config: Config;
	validateDirectoryExistence?: boolean;
	overrides?: Partial<AssetsOptions>;
}): ValidatedAssetsOptions | undefined {
	if (!overrides && !config.assets && !args.assets) {
		return;
	}

	const assets = {
		...config.assets,
		...(args.assets && { directory: args.assets }),
		...overrides,
	};

	if (assets.directory === undefined) {
		throw new UserError(
			"The `assets` property in your configuration is missing the required `directory` property.",
			{ telemetryMessage: "assets options missing directory" }
		);
	}

	if (assets.directory === "") {
		throw new UserError("`The assets directory cannot be an empty string.", {
			telemetryMessage: "assets options empty directory",
		});
	}

	const assetsBasePath = getAssetsBasePath(config, args.assets);
	const directory = path.resolve(assetsBasePath, assets.directory);

	const directoryStat = statSync(directory, { throwIfNoEntry: false });
	const directoryExists = !!directoryStat;

	const sourceOfTruthMessage = args.assets
		? '"--assets" command line argument'
		: '"assets.directory" field in your configuration file';

	if (validateDirectoryExistence && !directoryExists) {
		throw new NonExistentAssetsDirError(
			`The directory specified by the ${sourceOfTruthMessage} does not exist:\n` +
				`${directory}`,

			{
				telemetryMessage: "assets directory does not exist",
			}
		);
	}

	if (directoryExists && !directoryStat.isDirectory()) {
		throw new NonDirectoryAssetsDirError(
			`The path specified by the ${sourceOfTruthMessage} doesn't point to a directory:\n` +
				`${directory}`,

			{
				telemetryMessage: "assets directory path is not directory",
			}
		);
	}

	return {
		directory,
		binding: assets.binding,
		directoryExists,
	};
}

/**
 * Validate and fully resolve the assets options in one step.
 *
 * Convenience wrapper around `validateAssetsOptions` + `resolveAssetOptions`
 * for callers that need the full `AssetsOptions` immediately. The deploy /
 * versions-upload path instead validates when assembling props and defers
 * resolution to `resolveAssetOptions` inside `@cloudflare/deploy-helpers`.
 */
export function getAssetsOptions(opts: {
	args: { assets: string | undefined; script?: string };
	config: Config;
	validateDirectoryExistence?: boolean;
	overrides?: Partial<AssetsOptions>;
}): AssetsOptions | undefined {
	const assetsDir = validateAssetsOptions(opts);
	return resolveAssetOptions(
		{ assetsDir, main: opts.args.script ?? opts.config.main },
		opts.config
	);
}

/**
 * Validate assets configuration against the following requirements:
 *     - assets cannot be used in combination with a few other select
 *        Workers features, such as: legacy assets, sites and tail consumers
 *     - an asset binding cannot be used in a Worker that only has assets
 * and throw an appropriate error if invalid.
 */
export function validateAssetsArgsAndConfig(
	args: Pick<StartDevWorkerOptions, "legacy" | "assets" | "entrypoint">
): void;
export function validateAssetsArgsAndConfig(
	args:
		| Pick<StartDevOptions, "site" | "assets" | "script">
		| Pick<DeployArgs, "site" | "assets" | "script">,
	config: Config
): void;
export function validateAssetsArgsAndConfig(
	args:
		| Pick<StartDevOptions, "site" | "assets" | "script">
		| Pick<DeployArgs, "site" | "assets" | "script">
		| Pick<StartDevWorkerOptions, "legacy" | "assets" | "entrypoint">,
	config?: Config
): void {
	if (
		"legacy" in args
			? args.assets && args.legacy.site
			: (args.assets || config?.assets) && (args.site || config?.site)
	) {
		throw new UserError(
			"Cannot use assets and Workers Sites in the same Worker.\n" +
				"Please remove either the `site` or `assets` field from your configuration file.",
			{ telemetryMessage: "assets validation conflicting sites config" }
		);
	}

	const noOpEntrypoint = path.resolve(
		getBasePath(),
		"templates/no-op-worker.js"
	);

	if (
		"legacy" in args
			? args.entrypoint === noOpEntrypoint && args.assets?.binding
			: !(args.script || config?.main) && config?.assets?.binding
	) {
		throw new UserError(
			"Cannot use assets with a binding in an assets-only Worker.\n" +
				"Please remove the asset binding from your configuration file, or provide a Worker script in your configuration file (`main`).",
			{ telemetryMessage: "assets validation binding without worker script" }
		);
	}

	// Smart placement turned on when using assets
	if (
		config?.placement?.mode === "smart" &&
		config?.assets?.run_worker_first === true
	) {
		logger.warn(
			"Turning on Smart Placement in a Worker that is using assets and run_worker_first set to true means that your entire Worker could be moved to run closer to your data source, and all requests will go to that Worker before serving assets.\n" +
				"This could result in poor performance as round trip times could increase when serving assets.\n\n" +
				"Read more: https://developers.cloudflare.com/workers/static-assets/binding/#smart-placement"
		);
	}
}

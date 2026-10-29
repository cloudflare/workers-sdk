import { statSync } from "node:fs";
import * as path from "node:path";
import { resolveCompatibilityFlags } from "@cloudflare/workers-shared/utils/compatibility-flags";
import { parseStaticRouting } from "@cloudflare/workers-shared/utils/configuration/parseStaticRouting";
import {
	HEADERS_FILENAME,
	REDIRECTS_FILENAME,
} from "@cloudflare/workers-shared/utils/constants";
import { maybeGetFile } from "@cloudflare/workers-shared/utils/helpers";
import { UserError } from "../errors";
import type { Logger } from "../logger";
import type { AssetsOptions, ValidatedAssetsOptions } from "../types";
import type { Config } from "./config";
import type { AssetConfig, RouterConfig } from "@cloudflare/workers-shared";

/** Resolve routing and asset metadata after validating the asset directory. */
export function resolveAssetOptions(
	{
		assetsDir,
		main,
	}: {
		assetsDir: ValidatedAssetsOptions | undefined;
		main: string | undefined;
	},
	config: Config,
	logger: Pick<Logger, "warn">
): AssetsOptions | undefined {
	if (!assetsDir) {
		return undefined;
	}

	const { directory, binding, directoryExists } = assetsDir;

	const routerConfig: RouterConfig = {
		has_user_worker: main !== undefined,
	};

	if (typeof config.assets?.run_worker_first === "boolean") {
		routerConfig.invoke_user_worker_ahead_of_assets =
			config.assets.run_worker_first;
	} else if (Array.isArray(config.assets?.run_worker_first)) {
		routerConfig.static_routing = parseStaticRouting(
			config.assets.run_worker_first
		);
	}

	// User Worker always ahead of assets, but no assets binding provided
	if (
		routerConfig.invoke_user_worker_ahead_of_assets &&
		!config?.assets?.binding
	) {
		logger.warn(
			"run_worker_first=true set without an assets binding\n" +
				"Setting run_worker_first to true will always invoke your Worker script.\n" +
				"To fetch your assets from your Worker, please set the [assets.binding] key in your configuration file.\n\n" +
				"Read more: https://developers.cloudflare.com/workers/static-assets/binding/#binding"
		);
	}

	// Using run_worker_first but didn't provide a Worker script
	if (
		!routerConfig.has_user_worker &&
		(routerConfig.invoke_user_worker_ahead_of_assets === true ||
			routerConfig.static_routing)
	) {
		throw new UserError(
			"Cannot set run_worker_first without a Worker script.\n" +
				"Please remove run_worker_first from your configuration file, or provide a Worker script in your configuration file (`main`).",
			{ telemetryMessage: "assets router missing worker script" }
		);
	}

	// These files are parsed in Miniflare during dev. Upload the raw contents for
	// the platform to parse during deploy.
	const _redirects = directoryExists
		? maybeGetFile(path.join(directory, REDIRECTS_FILENAME))
		: undefined;
	const _headers = directoryExists
		? maybeGetFile(path.join(directory, HEADERS_FILENAME))
		: undefined;
	// defaults are set in asset worker
	const assetConfig: AssetConfig = {
		html_handling: config.assets?.html_handling,
		not_found_handling: config.assets?.not_found_handling,
		base_path: config.assets?.base_path,
		compatibility_flags: resolveCompatibilityFlags({
			compatibilityDate: config.compatibility_date,
			compatibilityFlags: config.compatibility_flags,
		}),
	};

	return {
		directory,
		binding,
		routerConfig,
		assetConfig,
		_redirects,
		_headers,
		// raw static routing rules for upload. routerConfig.static_routing contains the rules processed for dev.
		run_worker_first: config.assets?.run_worker_first,
	};
}

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

/** The configured asset directory does not exist. */
export class NonExistentAssetsDirError extends UserError {}

/** The configured asset path points to a file instead of a directory. */
export class NonDirectoryAssetsDirError extends UserError {}

/**
 * Validate and resolve the assets directory.
 *
 * This is the validation half of `getAssetsOptions`: it merges the assets
 * config with CLI args and overrides, validates the `directory` and resolves
 * its absolute path, and checks that the path exists (optionally) and is a
 * directory. The remaining options (router/asset config, _redirects/_headers)
 * are resolved later by `resolveAssetOptions`.
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
 * resolution to `resolveAssetOptions`.
 */
export function getAssetsOptions(
	opts: {
		args: { assets: string | undefined; script?: string };
		config: Config;
		validateDirectoryExistence?: boolean;
		overrides?: Partial<AssetsOptions>;
	},
	logger: Pick<Logger, "warn">
): AssetsOptions | undefined {
	const assetsDir = validateAssetsOptions(opts);
	return resolveAssetOptions(
		{ assetsDir, main: opts.args.script ?? opts.config.main },
		opts.config,
		logger
	);
}

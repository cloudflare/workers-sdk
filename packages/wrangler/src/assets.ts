import { statSync } from "node:fs";
import * as path from "node:path";
import { parseStaticRouting } from "@cloudflare/workers-shared/utils/configuration/parseStaticRouting";
import {
	HEADERS_FILENAME,
	REDIRECTS_FILENAME,
} from "@cloudflare/workers-shared/utils/constants";
import { maybeGetFile } from "@cloudflare/workers-shared/utils/helpers";
import { UserError } from "@cloudflare/workers-utils";
import { logger } from "./logger";
import { getBasePath } from "./paths";
import type { StartDevWorkerOptions } from "./api";
import type { DeployArgs } from "./deploy";
import type { StartDevOptions } from "./dev";
import type { AssetConfig, RouterConfig } from "@cloudflare/workers-shared";
import type { AssetsOptions, Config } from "@cloudflare/workers-utils";

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

export function getAssetsOptions({
	args,
	config,
	validateDirectoryExistence = true,
	overrides,
}: {
	args: { assets: string | undefined; script?: string };
	config: Config;
	validateDirectoryExistence?: boolean;
	overrides?: Partial<AssetsOptions>;
}): AssetsOptions | undefined {
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

	const routerConfig: RouterConfig = {
		has_user_worker: Boolean(args.script || config.main),
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
		// The _redirects and _headers files are parsed in Miniflare in dev and parsing is not required for deploy
		compatibility_date: config.compatibility_date,
		compatibility_flags: config.compatibility_flags,
	};

	return {
		directory,
		binding: assets.binding,
		routerConfig,
		assetConfig,
		_redirects,
		_headers,
		// raw static routing rules for upload. routerConfig.static_routing contains the rules processed for dev.
		run_worker_first: config.assets?.run_worker_first,
	};
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

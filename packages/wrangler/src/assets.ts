import * as path from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import { logger } from "./logger";
import { getBasePath } from "./paths";
import type { StartDevWorkerOptions } from "./api";
import type { DeployArgs } from "./deploy";
import type { StartDevOptions } from "./dev";
import type { Config } from "@cloudflare/workers-utils";

export {
	getAssetsOptions,
	NonDirectoryAssetsDirError,
	NonExistentAssetsDirError,
	validateAssetsOptions,
} from "@cloudflare/deploy-helpers";
export type { AssetManifest } from "@cloudflare/deploy-helpers";

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

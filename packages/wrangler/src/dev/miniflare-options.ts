import * as shared from "@cloudflare/dev-helpers/miniflare-options";
import { logger } from "../logger";
import type { StartDevWorkerInput } from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils/config";
import type { RemoteProxyConnectionString } from "miniflare";

export {
	buildAssetOptions,
	buildSitesOptions,
	getDefaultProjectTmpPath,
	getIdentifier,
	getSiteAssetPaths,
	getZoneFromConfig,
	isUnsafeServiceBindingWithDevCfg,
} from "@cloudflare/dev-helpers/miniflare-options";

/** Convert bindings with Wrangler's logger. */
export function buildMiniflareBindingOptions(
	config: Parameters<typeof shared.buildMiniflareBindingOptions>[0],
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined
) {
	return shared.buildMiniflareBindingOptions(
		config,
		remoteProxyConnectionString,
		logger
	);
}

/** Resolve local bindings with Wrangler's logger. */
export function getBindings(
	config: Config,
	env: string | undefined,
	envFiles: string[] | undefined,
	local: boolean,
	inputBindings: StartDevWorkerInput["bindings"],
	defaultBindings: StartDevWorkerInput["bindings"]
): StartDevWorkerInput["bindings"] {
	return shared.getBindings(
		config,
		env,
		envFiles,
		local,
		inputBindings,
		defaultBindings,
		logger
	);
}

/** Resolve Miniflare options with Wrangler's logger. */
export function getMiniflareWorkerOptions(
	config: Config | string,
	env?: string,
	options?: Omit<shared.MiniflareWorkerOptionsOptions, "logger">
): shared.MiniflareWorkerOptions {
	return shared.getMiniflareWorkerOptions(config, env, { ...options, logger });
}

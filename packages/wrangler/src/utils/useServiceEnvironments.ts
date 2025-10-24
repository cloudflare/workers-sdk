import type { StartDevWorkerOptions } from "../api";
import type { Config } from "@cloudflare/workers-utils";

/**
 * whether deprecated service environments are enabled.
 */
export function useServiceEnvironments(
	config: Config | StartDevWorkerOptions
): boolean {
	// legacy env refers to wrangler environments, which are not actually legacy in any way.
	// This is opposed to service environments, which are deprecated.
	// Unfortunately legacy-env is a public facing arg and config option, so we have to leave the name.
	// However we can change the internal handling to be less confusing.
	//
	// We only read from config here, because we've already accounted for
	// // args["legacy-env"] in https://github.com/cloudflare/workers-sdk/blob/b24aeb5722370c2e04bce97a84a1fa1e55725d79/packages/wrangler/src/config/validation.ts#L94-L98
	// return "legacy_env" in config
	// 	? config.legacy_env
	// 	: !config.legacy.useServiceEnvironments;
	return "legacy_env" in config
		? !config.legacy_env
		: Boolean(config.legacy.useServiceEnvironments);
}

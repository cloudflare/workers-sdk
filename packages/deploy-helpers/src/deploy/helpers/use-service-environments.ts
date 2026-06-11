import type { Config } from "@cloudflare/workers-utils";

/**
 * Whether deprecated service environments are enabled.
 */
export function useServiceEnvironments(
	config:
		| Config
		| { legacy_env?: boolean; legacy: { useServiceEnvironments?: boolean } }
): boolean {
	return "legacy_env" in config
		? !config.legacy_env
		: Boolean(config.legacy.useServiceEnvironments);
}

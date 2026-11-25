import { CONTAINER_REGISTRY_JURISDICTIONS } from "@cloudflare/workers-utils";
import type { ContainerRegistryConfig } from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils/config";

/** The `--jurisdiction` option for commands that use the managed registry. */
export const registryJurisdictionArg = {
	type: "string",
	choices: CONTAINER_REGISTRY_JURISDICTIONS,
	requiresArg: true,
	describe:
		"Use the managed registry for this jurisdiction instead of the default registry. Ignored in the FedRAMP High compliance region, which has a single registry.",
} as const;

/**
 * Selects the managed registry for a command's `--jurisdiction` option.
 *
 * @param config - Wrangler configuration, used for its compliance region.
 * @param jurisdiction - The `--jurisdiction` option, if set.
 * @returns The registry selection for the command.
 */
export function getRegistryConfigForJurisdiction(
	config: Config,
	jurisdiction: string | undefined
): ContainerRegistryConfig {
	return { compliance_region: config.compliance_region, jurisdiction };
}

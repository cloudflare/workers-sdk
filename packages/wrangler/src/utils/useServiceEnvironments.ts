import { useServiceEnvironments } from "@cloudflare/deploy-helpers";
import type { Config } from "@cloudflare/workers-utils";

export { useServiceEnvironments };

/**
 * even though service environments might be enabled, we might not need to use the service environments api
 */
export function useServiceEnvironmentApi(
	args: { env: string | undefined },
	config: Config
) {
	return Boolean(useServiceEnvironments(config) && args.env);
}

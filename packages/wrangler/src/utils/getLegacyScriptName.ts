import { useServiceEnvironments } from "./useServiceEnvironments";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Alternative to the getScriptName() because special Legacy cases allowed
 * "name", and "env" together in Wrangler v1
 */
export function getLegacyScriptName(
	args: { name: string | undefined; env: string | undefined },
	config: Config
) {
	return args.name && args.env && !useServiceEnvironments(config)
		? `${args.name}-${args.env}`
		: args.name ?? config.name;
}

import { isLegacyEnv } from "./isLegacyEnv";
import type { Config } from "../config";

/**
 * Alternative to the getScriptName() because special Legacy cases allowed
 * "name", and "env" together in Wrangler v1
 */
export function getLegacyScriptName(
	args: { name: string | undefined; env: string | undefined },
	config: Config
) {
	return args.name && args.env && isLegacyEnv(config)
		? `${args.name}-${args.env}`
		: args.name ?? config.name;
}

import type { Config } from "@cloudflare/workers-utils/config";

export function getRules(config: Config): Config["rules"] {
	return config.rules ?? [];
}

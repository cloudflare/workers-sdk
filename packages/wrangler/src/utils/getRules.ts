import type { Config } from "@cloudflare/workers-utils";

export function getRules(config: Config): Config["rules"] {
	return config.rules ?? [];
}

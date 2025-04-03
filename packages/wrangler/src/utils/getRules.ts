import type { Config } from "../config";

export function getRules(config: Config): Config["rules"] {
	return config.rules ?? [];
}

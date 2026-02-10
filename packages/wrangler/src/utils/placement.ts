import type { CfPlacement, Config } from "@cloudflare/workers-utils";

/**
 * Parse placement out of a Config
 */
export function parseConfigPlacement(config: Config): CfPlacement | undefined {
	if (config.placement) {
		const configPlacement = config.placement;
		const hint = "hint" in configPlacement ? configPlacement.hint : undefined;

		if (!hint && configPlacement.mode === "off") {
			return undefined;
		} else if (hint || configPlacement.mode === "smart") {
			return { mode: "smart", hint: hint };
		} else {
			// mode is undefined or "targeted", which both map to the targeted variant
			// TypeScript needs explicit checks to narrow the union type
			if ("region" in configPlacement && configPlacement.region) {
				return { mode: "targeted", region: configPlacement.region };
			} else if ("host" in configPlacement && configPlacement.host) {
				return { mode: "targeted", host: configPlacement.host };
			} else if ("hostname" in configPlacement && configPlacement.hostname) {
				return { mode: "targeted", hostname: configPlacement.hostname };
			} else {
				return undefined;
			}
		}
	} else {
		return undefined;
	}
}

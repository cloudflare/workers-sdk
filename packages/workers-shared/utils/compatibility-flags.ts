import type { AssetConfig } from "./types";

interface CompatibilityFlag {
	enable: `assets_${string}`;
	disable: `assets_${string}`;
	onByDefaultAfter?: string;
}

export const SEC_FETCH_MODE_NAVIGATE_HEADER_PREFERS_ASSET_SERVING = {
	enable: "assets_navigation_prefers_asset_serving",
	disable: "assets_navigation_has_no_effect",
	onByDefaultAfter: "2025-04-01",
} satisfies CompatibilityFlag;

const COMPATIBILITY_FLAGS = [
	SEC_FETCH_MODE_NAVIGATE_HEADER_PREFERS_ASSET_SERVING,
] as const;

export type ENABLEMENT_COMPATIBILITY_FLAGS =
	(typeof COMPATIBILITY_FLAGS)[number]["enable"];

/**
 * Resolves the effective set of asset compatibility flags for a Worker, given
 * its compatibility date and any explicitly-set compatibility flags.
 *
 * Date-based defaults are applied here so that the asset worker only ever needs
 * to reason about a concrete list of enabled flags. This is called at
 * CONFIG-construction time (deploy, dev/miniflare, vite), not at request time.
 */
export const resolveCompatibilityFlags = (options?: {
	compatibilityDate?: string;
	compatibilityFlags?: string[];
}): string[] => {
	const compatibilityDate = options?.compatibilityDate ?? "2021-11-02";
	const resolvedCompatibilityFlags = [...(options?.compatibilityFlags ?? [])];

	for (const compatibilityFlag of COMPATIBILITY_FLAGS) {
		if (
			compatibilityFlag.onByDefaultAfter &&
			compatibilityDate >= compatibilityFlag.onByDefaultAfter &&
			!resolvedCompatibilityFlags.includes(compatibilityFlag.disable) &&
			!resolvedCompatibilityFlags.includes(compatibilityFlag.enable)
		) {
			resolvedCompatibilityFlags.push(compatibilityFlag.enable);
		}
	}

	return resolvedCompatibilityFlags;
};

export const flagIsEnabled = (
	configuration: Pick<Required<AssetConfig>, "compatibility_flags">,
	compatibilityFlag: (typeof COMPATIBILITY_FLAGS)[number]
) => {
	return configuration.compatibility_flags.includes(compatibilityFlag.enable);
};

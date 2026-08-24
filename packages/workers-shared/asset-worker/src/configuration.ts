import { normalizeBasePath } from "../../utils/base-path";
import { resolveCompatibilityOptions } from "./compatibility-flags";
import type { AssetConfig } from "../../utils/types";
import type { NormalizedAssetConfig } from "./types";

export const normalizeConfiguration = (
	configuration?: AssetConfig
): NormalizedAssetConfig => {
	const compatibilityOptions = resolveCompatibilityOptions(configuration);
	const basePath = normalizeBasePath(configuration?.base_path ?? "/");
	if (!basePath.valid) {
		throw new Error(`Invalid assets base_path: ${basePath.error}`);
	}

	return {
		compatibility_date: compatibilityOptions.compatibilityDate,
		compatibility_flags: compatibilityOptions.compatibilityFlags,
		html_handling: configuration?.html_handling ?? "auto-trailing-slash",
		not_found_handling: configuration?.not_found_handling ?? "none",
		base_path: basePath.value,
		redirects: configuration?.redirects ?? {
			version: 1,
			staticRules: {},
			rules: {},
		},
		headers: configuration?.headers ?? {
			version: 2,
			rules: {},
		},
		has_static_routing: configuration?.has_static_routing ?? false,
		account_id: configuration?.account_id ?? -1,
		script_id: configuration?.script_id ?? -1,
		debug: configuration?.debug ?? false,
	};
};

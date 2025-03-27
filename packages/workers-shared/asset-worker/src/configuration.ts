import { resolveCompatibilityOptions } from "./compatibility-flags";
import type { AssetConfig } from "../../utils/types";

export const normalizeConfiguration = (
	configuration?: AssetConfig
): Required<AssetConfig> => {
	const compatibilityOptions = resolveCompatibilityOptions(configuration);

	return {
		compatibility_date: compatibilityOptions.compatibilityDate,
		compatibility_flags: compatibilityOptions.compatibilityFlags,
		html_handling: configuration?.html_handling ?? "auto-trailing-slash",
		not_found_handling: configuration?.not_found_handling ?? "none",
		redirects: configuration?.redirects ?? {
			version: 1,
			staticRules: {},
			rules: {},
		},
		headers: configuration?.headers ?? {
			version: 2,
			rules: {},
		},
		account_id: configuration?.account_id ?? -1,
		script_id: configuration?.script_id ?? -1,
	};
};

import type { AssetConfig } from "../../utils/types";

export const applyConfigurationDefaults = (
	configuration?: AssetConfig
): Required<AssetConfig> => {
	return {
		compatibility_date: configuration?.compatibility_date ?? "2021-11-02",
		compatibility_flags: configuration?.compatibility_flags ?? [],
		html_handling: configuration?.html_handling ?? "auto-trailing-slash",
		not_found_handling: configuration?.not_found_handling ?? "none",
		headers: configuration?.headers ?? {
			version: 2,
			rules: {},
		},
		account_id: configuration?.account_id ?? -1,
		script_id: configuration?.script_id ?? -1,
	};
};

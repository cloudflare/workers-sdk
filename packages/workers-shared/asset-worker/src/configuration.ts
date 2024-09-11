import type { AssetConfig } from "../../utils/types";

export const applyConfigurationDefaults = (
	configuration?: AssetConfig
): Required<AssetConfig> => {
	return {
		html_handling: configuration?.html_handling ?? "auto-trailing-slash",
		not_found_handling: configuration?.not_found_handling ?? "none",
	};
};

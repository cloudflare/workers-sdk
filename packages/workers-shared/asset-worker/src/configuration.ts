import type { AssetConfig } from "../../utils/types";

export const normalizeConfiguration = (
	configuration?: AssetConfig
): Required<AssetConfig> => {
	return {
		compatibility_date: configuration?.compatibility_date ?? "2021-11-02",
		compatibility_flags: configuration?.compatibility_flags ?? [],
		html_handling: configuration?.html_handling ?? "auto-trailing-slash",
		not_found_handling: configuration?.single_page_application
			? "single-page-application"
			: configuration?.not_found_handling ?? "none",
		single_page_application: configuration?.single_page_application ?? false,
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

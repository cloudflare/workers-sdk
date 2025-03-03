import type { AssetConfig } from "../../utils/types";

export const applyConfigurationDefaults = (
	configuration?: AssetConfig
): Required<AssetConfig> => {
	let runWorkerFirst = undefined;
	if (configuration?.run_worker_first !== undefined) {
		runWorkerFirst = configuration?.run_worker_first;
	} else if (configuration?.serve_directly !== undefined) {
		runWorkerFirst = !configuration.serve_directly;
	} else {
		runWorkerFirst = false;
	}

	return {
		html_handling: configuration?.html_handling ?? "auto-trailing-slash",
		not_found_handling: configuration?.not_found_handling ?? "none",
		run_worker_first: runWorkerFirst,
		serve_directly: !runWorkerFirst,
	};
};

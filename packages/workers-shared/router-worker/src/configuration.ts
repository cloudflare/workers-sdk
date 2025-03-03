import type { RouterConfig } from "../../utils/types";

export const applyConfigurationDefaults = (
	configuration?: RouterConfig
): Required<RouterConfig> => {
	return {
		invoke_user_worker_ahead_of_assets:
			configuration?.invoke_user_worker_ahead_of_assets ?? false,
		has_user_worker: configuration?.has_user_worker ?? false,
		account_id: configuration?.account_id ?? -1,
		script_id: configuration?.script_id ?? -1,
	};
};

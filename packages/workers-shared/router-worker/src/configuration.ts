import type { EyeballRouterConfig, RouterConfig } from "../../utils/types";

type RequiredEyeballRouterConfig = Required<Exclude<EyeballRouterConfig, null>>;

export const applyRouterConfigDefaults = (
	configuration?: RouterConfig
): Required<RouterConfig> => {
	return {
		invoke_user_worker_ahead_of_assets:
			configuration?.invoke_user_worker_ahead_of_assets ?? false,
		has_user_worker: configuration?.has_user_worker ?? false,
		account_id: configuration?.account_id ?? -1,
		script_id: configuration?.script_id ?? -1,
		debug: configuration?.debug ?? false,
		static_routing: configuration?.static_routing ?? {
			user_worker: [],
		},
	};
};

export const applyEyeballConfigDefaults = (
	eyeballConfiguration?: EyeballRouterConfig
): RequiredEyeballRouterConfig => {
	return {
		limitedAssetsOnly: eyeballConfiguration?.limitedAssetsOnly ?? false,
	};
};

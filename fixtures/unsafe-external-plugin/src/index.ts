import {
	UNSAFE_PLUGIN_NAME,
	UNSAFE_SERVICE_PLUGIN,
} from "./plugins/unsafe-service";

export const plugins = {
	[UNSAFE_PLUGIN_NAME]: UNSAFE_SERVICE_PLUGIN,
};

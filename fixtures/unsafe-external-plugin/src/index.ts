import { PluginLoader } from "miniflare";
import {
	UNSAFE_PLUGIN_NAME,
	UNSAFE_SERVICE_PLUGIN,
} from "./plugins/unsafeService";

const pluginRegistry: PluginLoader = {
	// TODO: I need to type this better
	registerMiniflarePlugins<
		UnsafeServiceBindingOption,
		UnsafeServiceBindingSharedOption,
	>() {
		return {
			[UNSAFE_PLUGIN_NAME]: UNSAFE_SERVICE_PLUGIN,
		};
	},
};

export const { registerMiniflarePlugins } = pluginRegistry;

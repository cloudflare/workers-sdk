import { PluginLoader } from "miniflare";
import {
	UNSAFE_PLUGIN_NAME,
	UNSAFE_SERVICE_PLUGIN,
} from "./plugins/unsafe-service";

const pluginRegistry: PluginLoader = {
	// TODO: I need to type this better
	// @ts-expect-error Needs help with typing
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

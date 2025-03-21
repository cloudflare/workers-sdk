import { cloudflare as originalCloudflarePlugin } from "@cloudflare/vite-plugin";
import type { PluginConfig } from "@cloudflare/vite-plugin";

/**
 * Wrapper of the cloudflare vite-plugin that sets some (overridable) default behavior
 * that generally makes sense for all playground applications
 */
export function cloudflare(config?: PluginConfig) {
	return originalCloudflarePlugin({
		/**
		 * since playground apps are used for testing and in CI inspectors are not tested
		 * and potentially problematic (e.g. the right port needs to be available etc...)
		 * let's disable inspectors
		 */
		inspectorPort: false,
		/**
		 * we don't generally care about persisting state for the playground apps (this is
		 * a feature more geared to proper long-lived applications)
		 */
		persistState: false,
		...config,
	});
}

import type { Plugin } from "esbuild";

/**
 * An esbuild plugin that will mark any `cloudflare:...` imports as external.
 */
export const cloudflareInternalPlugin: Plugin = {
	name: "Cloudflare internal imports plugin",
	setup(pluginBuild) {
		pluginBuild.onResolve({ filter: /^cloudflare:.*/ }, () => {
			return { external: true };
		});
	},
};

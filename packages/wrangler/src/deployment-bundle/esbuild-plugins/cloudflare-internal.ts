import type { Plugin } from "esbuild";

/**
 * An esbuild plugin that will mark any `cloudflare:...` imports as external.
 */
export const cloudflareInternalPlugin: Plugin = {
	name: "cloudflare javascript Plugin",
	setup(pluginBuild) {
		pluginBuild.onResolve({ filter: /^cloudflare:.*/ }, () => {
			return { external: true };
		});
	},
};

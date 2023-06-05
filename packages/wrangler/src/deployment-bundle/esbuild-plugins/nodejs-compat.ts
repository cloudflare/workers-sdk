import type { Plugin } from "esbuild";

/**
 * An esbuild plugin that will mark any `node:...` imports as external.
 */
export const nodejsCompatPlugin: Plugin = {
	name: "nodejs_compat Plugin",
	setup(pluginBuild) {
		pluginBuild.onResolve({ filter: /node:.*/ }, () => {
			return { external: true };
		});
	},
};

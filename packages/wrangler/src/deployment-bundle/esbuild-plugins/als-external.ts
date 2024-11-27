import type { Plugin } from "esbuild";

/**
 * An esbuild plugin that will mark `node:async_hooks` imports as external.
 */
export const asyncLocalStoragePlugin: Plugin = {
	name: "async-local-storage-imports",
	setup(pluginBuild) {
		pluginBuild.onResolve({ filter: /^node:async_hooks(\/|$)/ }, () => {
			return { external: true };
		});
	},
};

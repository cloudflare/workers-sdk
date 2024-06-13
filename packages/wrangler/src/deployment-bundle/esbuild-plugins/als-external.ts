import type { Plugin } from "esbuild";

/**
 * An esbuild plugin that will mark `node:async_hooks` imports as external.
 */
export const asyncLocalStoragePlugin: Plugin = {
	name: "Mark async local storage imports as external plugin",
	setup(pluginBuild) {
		pluginBuild.onResolve({ filter: /^node:async_hooks/ }, () => {
			return { external: true };
		});
	},
};

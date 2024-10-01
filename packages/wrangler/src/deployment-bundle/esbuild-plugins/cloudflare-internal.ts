import type { Plugin } from "esbuild";

/**
 * An esbuild plugin that will mark any `cloudflare:...` imports as external.
 */
export const cloudflareInternalPlugin: Plugin = {
	name: "Cloudflare internal imports plugin",
	setup(pluginBuild) {
		pluginBuild.onResolve({ filter: /^cloudflare:.*/ }, (args) => {
			if (pluginBuild.initialOptions.format === "iife") {
				//  If we are bundling a "Service Worker" formatted Worker, imports of external modules,
				//  which won't be inlined/bundled by esbuild, are invalid.
				//
				//  Throw an error if we identify `cloudflare:...` external imports.
				//
				throw new Error(
					`Unexpected import "${args.path}" which is not valid in a Service Worker format Worker. Are you missing a default export from your Worker?`
				);
			}
			return { external: true };
		});
	},
};

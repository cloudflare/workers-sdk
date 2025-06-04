import type { Plugin } from "esbuild";

/**
 * An esbuild plugin that will export URL from the url polyfill
 */
export const standardURLPlugin: () => Plugin = () => ({
	name: "standard-URL",
	setup(pluginBuild) {
		pluginBuild.onResolve({ filter: /^node:url$|^url$/ }, ({ importer }) => {
			if (importer === "standard-url-plugin") {
				return;
			}
			return {
				path: "wrangler-url-polyfill",
				namespace: "wrangler-url",
			};
		});
		pluginBuild.onResolve(
			{ filter: /^wrangler:url$/ },
			async ({ kind, resolveDir }) => {
				const result = await pluginBuild.resolve("url", {
					kind,
					resolveDir,
					importer: "standard-url-plugin",
				});

				return result;
			}
		);
		pluginBuild.onLoad(
			{ filter: /^wrangler-url-polyfill$/, namespace: "wrangler-url" },
			() => {
				return {
					loader: "js",
					contents: `export * from "wrangler:url"; export const URL = globalThis.URL`,
				};
			}
		);
	},
});

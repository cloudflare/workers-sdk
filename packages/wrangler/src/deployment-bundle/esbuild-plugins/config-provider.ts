import type { Plugin } from "esbuild";

/**
 * An esbuild plugin support synthetic "configuration" imports.
 *
 * For example, the following call to this function
 *
 * ```ts
 * configProviderPlugin({
 *   "json": {
 *     SOME_CONFIG: "..."
 *   }
 * })
 * ```
 *
 * would allow the following import in source code being bundled
 *
 * ```
 * import { SOME_CONFIG } from "config:middleware/json"
 * ```
 */
export function configProviderPlugin(
	config: Record<string, Record<string, unknown>>
): Plugin {
	return {
		name: "middleware-config-provider",
		setup(build) {
			build.onResolve({ filter: /^config:/ }, (args) => ({
				path: args.path,
				namespace: "wrangler-config",
			}));

			build.onLoad(
				{ filter: /.*/, namespace: "wrangler-config" },
				async (args) => {
					const middleware = args.path.split("config:middleware/")[1];
					if (!config[middleware]) {
						throw new Error(`No config found for ${middleware}`);
					}
					return {
						loader: "json",
						contents: JSON.stringify(config[middleware]),
					};
				}
			);
		},
	};
}

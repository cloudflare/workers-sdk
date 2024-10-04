import { dedent } from "../../utils/dedent";
import type { Plugin } from "esbuild";

/**
 * An esbuild plugin that will mark any `cloudflare:...` imports as external.
 */
export const cloudflareInternalPlugin: Plugin = {
	name: "Cloudflare internal imports plugin",
	setup(pluginBuild) {
		const paths = new Set();
		pluginBuild.onStart(() => paths.clear());
		pluginBuild.onResolve({ filter: /^cloudflare:.*/ }, (args) => {
			paths.add(args.path);
			return { external: true };
		});
		pluginBuild.onEnd(() => {
			if (pluginBuild.initialOptions.format === "iife" && paths.size > 0) {
				// If we are bundling in "Service Worker" mode,
				// imports of external modules such as `cloudflare:...`,
				// which won't be inlined/bundled by esbuild, are invalid.
				const pathList = new Intl.ListFormat("en-US").format(
					Array.from(paths.keys())
						.map((p) => `"${p}"`)
						.sort()
				);
				throw new Error(
					dedent`
						Unexpected external import of ${pathList}. Imports are not valid in a Service Worker format Worker.
						Did you mean to create a Module Worker?
						If so, try adding \`export default { ... }\` in your entry-point.
						See https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/.
					`
				);
			}
		});
	},
};

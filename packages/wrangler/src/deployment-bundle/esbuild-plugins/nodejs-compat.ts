import { relative } from "path";
import chalk from "chalk";
import { logger } from "../../logger";
import { dedent } from "../../utils/dedent";
import type { Plugin } from "esbuild";

/**
 * An esbuild plugin that will mark any `node:...` imports as external.
 */
export const nodejsCompatPlugin: (silenceWarnings: boolean) => Plugin = (
	silenceWarnings
) => ({
	name: "nodejs_compat-imports",
	setup(pluginBuild) {
		// Infinite loop detection
		const seen = new Set<string>();

		// Prevent multiple warnings per package
		const warnedPackaged = new Map<string, string[]>();

		pluginBuild.onStart(() => {
			seen.clear();
			warnedPackaged.clear();
		});
		pluginBuild.onResolve(
			{ filter: /node:.*/ },
			async ({ path, kind, resolveDir, ...opts }) => {
				const specifier = `${path}:${kind}:${resolveDir}:${opts.importer}`;
				if (seen.has(specifier)) {
					return;
				}

				seen.add(specifier);
				// Try to resolve this import as a normal package
				const result = await pluginBuild.resolve(path, {
					kind,
					resolveDir,
					importer: opts.importer,
				});

				if (result.errors.length > 0) {
					// esbuild couldn't resolve the package
					// We should warn the user, but not fail the build

					let pathWarnedPackaged = warnedPackaged.get(path);
					if (pathWarnedPackaged === undefined) {
						warnedPackaged.set(path, (pathWarnedPackaged = []));
					}
					pathWarnedPackaged.push(opts.importer);

					return { external: true };
				}
				// This is a normal package—don't treat it specially
				return result;
			}
		);

		/**
		 * If we are bundling a "Service Worker" formatted Worker, imports of external modules,
		 * which won't be inlined/bundled by esbuild, are invalid.
		 *
		 * This `onEnd()` handler will error if it identifies node.js external imports.
		 */
		pluginBuild.onEnd(() => {
			if (
				pluginBuild.initialOptions.format === "iife" &&
				warnedPackaged.size > 0
			) {
				const paths = new Intl.ListFormat("en-US").format(
					Array.from(warnedPackaged.keys())
						.map((p) => `"${p}"`)
						.sort()
				);
				return {
					errors: [
						{
							text: dedent`
								Unexpected external import of ${paths}.
								Your worker has no default export, which means it is assumed to be a Service Worker format Worker.
								Did you mean to create a ES Module format Worker?
								If so, try adding \`export default { ... }\` in your entry-point.
								See https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/.
							`,
						},
					],
				};
			}
		});

		// Wait until the build finishes to log warnings, so that all files which import a package
		// can be collated
		pluginBuild.onEnd(() => {
			if (!silenceWarnings) {
				warnedPackaged.forEach((importers: string[], path: string) => {
					logger.warn(
						dedent`
						The package "${path}" wasn't found on the file system but is built into node.
						Your Worker may throw errors at runtime unless you enable the "nodejs_compat" compatibility flag. Refer to https://developers.cloudflare.com/workers/runtime-apis/nodejs/ for more details. Imported from:
						${toList(importers, pluginBuild.initialOptions.absWorkingDir)}`
					);
				});
			}
		});
	},
});

function toList(items: string[], absWorkingDir: string | undefined): string {
	return items
		.map((i) => ` - ${chalk.blue(relative(absWorkingDir ?? "/", i))}`)
		.join("\n");
}

import chalk from "chalk";
import { logger } from "../../logger";
import type { Plugin } from "esbuild";
import { relative } from "path";

// Infinite loop detection
const seen = new Set();

// Prevent multiple warnings per package
const warnedPackaged = new Map();

/**
 * An esbuild plugin that will mark any `node:...` imports as external.
 */
export const nodejsCompatPlugin: (silenceWarnings: boolean) => Plugin = (
	silenceWarnings
) => ({
	name: "nodejs_compat imports plugin",
	setup(pluginBuild) {
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

					if (!warnedPackaged.has(path)) {
						warnedPackaged.set(path, [opts.importer]);
					} else {
						warnedPackaged.set(path, [
							...warnedPackaged.get(path),
							opts.importer,
						]);
					}
					return { external: true };
				}
				// This is a normal package—don't treat it specially
				return result;
			}
		);
		// Wait until the build finishes to log warnings, so that all files which import a package
		// can be collated
		pluginBuild.onEnd(() => {
			if (!silenceWarnings)
				warnedPackaged.forEach((importers: string[], path: string) => {
					logger.warn(
						`The package "${path}" wasn't found on the file system but is built into node.
Your Worker may throw errors at runtime unless you enable the "nodejs_compat" compatibility flag. Refer to https://developers.cloudflare.com/workers/runtime-apis/nodejs/ for more details. Imported from:
${importers
	.map(
		(i) =>
			` - ${chalk.blue(
				relative(pluginBuild.initialOptions.absWorkingDir ?? "/", i)
			)}`
	)
	.join("\n")}`
					);
				});
		});
	},
});

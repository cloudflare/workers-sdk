import { readFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import * as esbuild from "esbuild";
import { logger } from "./logger";
import createModuleCollector from "./module-collection";
import type { BundleResult } from "./bundle";
import type { Config } from "./config";
import type { Entry } from "./entry";

export default async function traverseModuleGraph(
	entry: Entry,
	rules: Config["rules"],
	tsconfig?: string | undefined
): Promise<BundleResult> {
	const entrypoint = path.relative(entry.directory, entry.file);
	// The fact that we're using esbuild to try and traverse the dependency graph to find modules
	// to upload is an internal detail & optimisation. Errors from esbuild should be ignored, and the worker
	// uploaded without change.
	try {
		const moduleCollector = createModuleCollector({
			// These are deprecated, and so won't be supported for `--no-bundle` module collection
			wrangler1xlegacyModuleReferences: {
				rootDirectory: entry.directory,
				fileNames: new Set(),
			},
			format: entry.format,
			rules,
			preserveFileNames: true,
		});
		const result = await esbuild.build({
			entryPoints: [entry.file],
			absWorkingDir: entry.directory,
			metafile: true,
			// This is required for ESBuild to collect modules
			bundle: true,
			target: "es2022",
			// Ignore external packages
			packages: "external",
			write: false,
			loader: {
				".js": "jsx",
				".mjs": "jsx",
				".cjs": "jsx",
			},
			...(tsconfig && { tsconfig }),
			plugins: [moduleCollector.plugin],
		});

		const modules = Object.entries((result.metafile as esbuild.Metafile).inputs)
			// Don't include the entrypoint as a module
			.filter(([p, _]) => p !== entrypoint)
			.map(([p, _]) => [
				p,
				path.relative(
					path.dirname(entry.file),
					path.resolve(entry.directory, p)
				),
			]);
		if (modules.length > 0) {
			logger.info(`Detected module imports. Uploading additional modules:`);
			modules.forEach(([p, name]) => {
				logger.info(chalk.blue(`- ${name} (${p})`));
			});
		}

		// Resolve collected modules relative to the project root, and de-duplicate
		const collectedModules = Object.entries(
			Object.fromEntries(
				moduleCollector.modules.map(({ name, ...m }) => [
					path.relative(
						path.dirname(entry.file),
						path.resolve(entry.directory, name)
					),
					m,
				])
			)
		).map(([name, m]) => ({ name, ...m }));

		if (collectedModules.length > 0) {
			logger.info(`Detected data modules. Uploading additional data modules:`);
			collectedModules.forEach(({ name, type }) => {
				logger.info(chalk.blue(`- ${name} (${type})`));
			});
		}

		return {
			modules: collectedModules.concat(
				...(await Promise.all(
					modules.map(async ([p, name]) => ({
						name,
						content: await readFile(p, "utf-8"),
					}))
				))
			),
			dependencies: {},
			resolvedEntryPointPath: entry.file,
			bundleType: entry.format === "modules" ? "esm" : "commonjs",
			stop: undefined,
			sourceMapPath: undefined,
		};
	} catch (e) {
		logger.warn(
			`Failed to traverse module graph. Continuing with entrypoint ${entrypoint}...`
		);
		return {
			modules: [],
			dependencies: {},
			resolvedEntryPointPath: entry.file,
			bundleType: entry.format === "modules" ? "esm" : "commonjs",
			stop: undefined,
			sourceMapPath: undefined,
		};
	}
}

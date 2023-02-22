import { readFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { init, parse } from "es-module-lexer";
import * as esbuild from "esbuild";
import { CommonESBuildOptions, isBuildFailure } from "./bundle";
import { logger } from "./logger";
import createModuleCollector from "./module-collection";
import { ParseError } from "./parse";
import type { BundleResult } from "./bundle";
import type { Config } from "./config";
import type { Entry } from "./entry";

function variableDynamicImports(source: string): {
	statement: [string | undefined, string, string | undefined];
	lineNumber: number;
}[] {
	const [imports] = parse(source);
	return imports
		.filter((i) => i.d && !i.n)
		.map((i) => {
			const statement = source.slice(i.ss, i.se);
			const previousLines = source.slice(0, i.ss).split("\n");
			const followingLines = source.slice(i.se, -1).split("\n");
			return {
				statement: [previousLines.at(-1), statement, followingLines.at(0)],
				lineNumber: previousLines.length,
			};
		});
}

class VariableDynamicImport extends ParseError {
	constructor(
		sourceFile: string,
		importDetails: ReturnType<typeof variableDynamicImports>[number]
	) {
		super({
			text: "Your Worker contains a non string-literal dynamic import, which is not supported by Wrangler",
			kind: "error",
			location: {
				file: sourceFile,
				line: importDetails.lineNumber,
				column: importDetails.statement[0]?.length ?? 0,
				lineText: `${importDetails.statement[0] ?? ""}${
					importDetails.statement[1]
				}${importDetails.statement[2] ?? ""}`,
			},
		});
	}
}

export default async function traverseModuleGraph(
	entry: Entry,
	rules: Config["rules"],
	tsconfig?: string | undefined
): Promise<BundleResult> {
	await init;

	const entrypoint = path.relative(entry.directory, entry.file);
	// The fact that we're using esbuild to try and traverse the dependency graph to find modules
	// to upload is an internal detail & optimisation. Errors from esbuild should generally be ignored, and the worker
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

		// We need to read files to determine whether they have dynamic imports, and so
		// as an optimisation we can store that value
		const fileContents = new Map<string, string>();
		const result = await esbuild.build({
			logLevel: "silent",
			entryPoints: [entry.file],
			absWorkingDir: entry.directory,
			metafile: true,
			// This is required for ESBuild to collect modules
			bundle: true,
			target: CommonESBuildOptions.target,
			// Ignore external packages
			packages: "external",
			write: false,
			loader: CommonESBuildOptions.loader,
			...(tsconfig && { tsconfig }),
			plugins: [
				moduleCollector.plugin,
				{
					name: "dynamic-import-check",
					setup(build) {
						build.onLoad({ filter: /\.(m|c)?js?$/ }, async (args) => {
							const contents = await readFile(args.path, "utf8");
							fileContents.set(args.path, contents);
							const dynamicImports = variableDynamicImports(contents);
							if (dynamicImports.length > 0) {
								throw new VariableDynamicImport(
									path.relative(entry.directory, args.path),
									dynamicImports[0]
								);
							}
							return {
								contents,
								loader: "jsx",
							};
						});
					},
				},
			],
		});

		const modules = Object.keys((result.metafile as esbuild.Metafile).inputs)
			// Don't include the entrypoint as a module
			.filter((p) => p !== entrypoint)
			.map((p) => [
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
			logger.info(
				`Detected non-javascript module rules. Uploading additional modules:`
			);
			collectedModules.forEach(({ name, type }) => {
				logger.info(chalk.blue(`- ${name} (${type})`));
			});
		}

		return {
			modules: collectedModules.concat(
				...(await Promise.all(
					modules.map(async ([p, name]) => ({
						name,
						content: fileContents.get(p) ?? (await readFile(p, "utf-8")),
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
		// The specific case of dynamic imports being unfindable should cause a hard build error
		if (
			isBuildFailure(e) &&
			e.errors[0].detail instanceof VariableDynamicImport
		) {
			throw e.errors[0].detail;
		}
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

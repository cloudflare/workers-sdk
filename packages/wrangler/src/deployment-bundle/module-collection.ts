import crypto from "node:crypto";
import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import globToRegExp from "glob-to-regexp";
import { sync as resolveSync } from "resolve";
import { exports as resolveExports } from "resolve.exports";
import { UserError } from "../errors";
import { logger } from "../logger";
import { getBuildConditions } from "./bundle";
import {
	findAdditionalModules,
	findAdditionalModuleWatchDirs,
} from "./find-additional-modules";
import { isJavaScriptModuleRule, parseRules } from "./rules";
import type { Config, ConfigModuleRuleType } from "../config";
import type { Entry } from "./entry";
import type { CfModule, CfModuleType } from "./worker";
import type esbuild from "esbuild";

function flipObject<
	K extends string | number | symbol,
	V extends string | number | symbol,
>(obj: Record<K, V>): Record<V, K> {
	return Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]));
}

export const RuleTypeToModuleType: Record<ConfigModuleRuleType, CfModuleType> =
	{
		ESModule: "esm",
		CommonJS: "commonjs",
		CompiledWasm: "compiled-wasm",
		Data: "buffer",
		Text: "text",
		PythonModule: "python",
		PythonRequirement: "python-requirement",
		NodeJsCompatModule: "nodejs-compat-module",
	};

export const ModuleTypeToRuleType = flipObject(RuleTypeToModuleType);

// This is a combination of an esbuild plugin and a mutable array
// that we use to collect module references from source code.
// There will be modules that _shouldn't_ be inlined directly into
// the bundle. (eg. wasm modules, some text files, etc). We can include
// those files as modules in the multi part worker form upload. This
// plugin+array is used to collect references to these modules, reference
// them correctly in the bundle, and add them to the form upload.

export type ModuleCollector = {
	modules: CfModule[];
	plugin: esbuild.Plugin;
};

const modulesWatchRegexp = /^wrangler:modules-watch$/;
const modulesWatchNamespace = "wrangler-modules-watch";

export const noopModuleCollector: ModuleCollector = {
	modules: [],
	plugin: {
		name: "wrangler-module-collector",
		setup: (build) => {
			build.onResolve({ filter: modulesWatchRegexp }, (args) => {
				return { namespace: modulesWatchNamespace, path: args.path };
			});
			build.onLoad(
				{ namespace: modulesWatchNamespace, filter: modulesWatchRegexp },
				() => ({ contents: "", loader: "js" })
			);
		},
	},
};

// Extracts a package name from a string that may be a file path
// or a package name. Returns null if the string is not a valid
// Handles `wrangler`, `wrangler/example`, `wrangler/example.wasm`,
// `@cloudflare/wrangler`, `@cloudflare/wrangler/example`, etc.
export function extractPackageName(packagePath: string) {
	if (packagePath.startsWith(".")) {
		return null;
	}

	const match = packagePath.match(/^(@[^/]+\/)?([^/]+)/);

	if (match) {
		const scoped = match[1] || "";
		const packageName = match[2];
		return `${scoped}${packageName}`;
	}
	return null;
}

export function createModuleCollector(props: {
	entry: Entry;
	findAdditionalModules: boolean;
	rules?: Config["rules"];
	// a collection of "legacy" style module references, which are just file names
	// we will eventually deprecate this functionality, hence the verbose greppable name
	wrangler1xLegacyModuleReferences?: {
		rootDirectory: string;
		fileNames: Set<string>;
	};
	preserveFileNames?: boolean;
}): ModuleCollector {
	const parsedRules = parseRules(props.rules);

	const modules: CfModule[] = [];
	return {
		modules,
		plugin: {
			name: "wrangler-module-collector",
			setup(build) {
				let foundModulePaths: string[] = [];

				build.onStart(async () => {
					// reset the module collection array
					modules.splice(0);

					if (props.findAdditionalModules) {
						// Make sure we're not bundling a service worker
						if (props.entry.format !== "modules") {
							const error =
								"`find_additional_modules` can only be used with an ES module entrypoint.\n" +
								"Remove `find_additional_modules = true` from your configuration, " +
								"or migrate to the ES module Worker format: " +
								"https://developers.cloudflare.com/workers/learning/migrate-to-module-workers/";
							return { errors: [{ text: error }] };
						}

						const found = await findAdditionalModules(props.entry, parsedRules);
						foundModulePaths = found.map(({ name }) =>
							path.resolve(props.entry.moduleRoot, name)
						);
						modules.push(...found);
					}
				});

				// `esbuild` doesn't support returning `watch*` options from `onStart()`
				// callbacks. Instead, we define an empty virtual module that is
				// imported in an injected module. Importing this module registers the
				// required watchers.

				build.onResolve({ filter: modulesWatchRegexp }, (args) => {
					return { namespace: modulesWatchNamespace, path: args.path };
				});
				build.onLoad(
					{ namespace: modulesWatchNamespace, filter: modulesWatchRegexp },
					async () => {
						let watchFiles: string[] = [];
						const watchDirs: string[] = [];
						if (props.findAdditionalModules) {
							// Watch files to rebuild when they're changed/deleted. Note we
							// could watch additional modules when we import them, but this
							// doesn't cover dynamically imported modules with variable paths
							// (e.g. await import(`./lang/${language}.js`)).
							watchFiles = foundModulePaths;

							// Watch directories to rebuild when *new* files are added.
							// Note watching directories doesn't watch their subdirectories
							// or file contents: https://esbuild.github.io/plugins/#on-load-results
							const root = path.resolve(props.entry.moduleRoot);
							for await (const dir of findAdditionalModuleWatchDirs(root)) {
								watchDirs.push(dir);
							}
						}

						return { contents: "", loader: "js", watchFiles, watchDirs };
					}
				);

				// ~ start legacy module specifier support ~

				// This section detects usage of "legacy" 1.x style module specifiers
				// and modifies them so they "work" in wrangler v2, but with a warning

				const rulesMatchers = parsedRules.rules.flatMap((rule) => {
					return rule.globs.map((glob) => {
						const regex = globToRegExp(glob);
						return {
							regex,
							rule,
						};
					});
				});

				if (
					props.wrangler1xLegacyModuleReferences &&
					props.wrangler1xLegacyModuleReferences.fileNames.size > 0
				) {
					build.onResolve(
						{
							filter: new RegExp(
								"^(" +
									[...props.wrangler1xLegacyModuleReferences.fileNames]
										.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
										.join("|") +
									")$"
							),
						},
						async (args: esbuild.OnResolveArgs) => {
							if (
								args.kind !== "import-statement" &&
								args.kind !== "require-call"
							) {
								return;
							}
							// In the future, this will simply throw an error
							logger.warn(
								`Deprecation: detected a legacy module import in "./${path.relative(
									process.cwd(),
									args.importer
								)}". This will stop working in the future. Replace references to "${
									args.path
								}" with "./${args.path}";`
							);

							// take the file and massage it to a
							// transportable/manageable format
							const filePath = path.join(
								// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
								props.wrangler1xLegacyModuleReferences!.rootDirectory,
								args.path
							);
							const fileContent = await readFile(filePath);
							const fileHash = crypto
								.createHash("sha1")
								.update(fileContent)
								.digest("hex");
							const fileName = props.preserveFileNames
								? args.path
								: `./${fileHash}-${path.basename(args.path)}`;

							const { rule } =
								rulesMatchers.find(({ regex }) => regex.test(fileName)) || {};
							if (rule) {
								// add the module to the array
								modules.push({
									name: fileName,
									filePath,
									content: fileContent,
									type: RuleTypeToModuleType[rule.type],
								});
								return {
									path: fileName, // change the reference to the changed module
									external: props.entry.format === "modules", // mark it as external in the bundle
									namespace: `wrangler-module-${rule.type}`, // just a tag, this isn't strictly necessary
									watchFiles: [filePath], // we also add the file to esbuild's watch list
								};
							}
						}
					);
				}

				// ~ end legacy module specifier support ~

				parsedRules.rules?.forEach((rule) => {
					if (!props.findAdditionalModules && isJavaScriptModuleRule(rule)) {
						return;
					}

					rule.globs.forEach((glob) => {
						build.onResolve(
							{ filter: globToRegExp(glob) },
							async (args: esbuild.OnResolveArgs) => {
								// take the file and massage it to a
								// transportable/manageable format

								let filePath = path.join(args.resolveDir, args.path);

								// If this was a found additional module, mark it as external.
								// Note, there's no need to watch the file here as we already
								// watch all `foundModulePaths` with `wrangler:modules-watch`.
								if (foundModulePaths.includes(filePath)) {
									return { path: args.path, external: true };
								}
								// For JavaScript module rules, we only register this onResolve
								// callback if `findAdditionalModules` is true. If we didn't
								// find the module in `modules` in the above `if` block, leave
								// it to `esbuild` to bundle it.
								if (isJavaScriptModuleRule(rule)) {
									return;
								}

								// Check if this file is possibly from an npm package
								// and if so, validate the import against the package.json exports
								// and resolve the file path to the correct file.
								if (args.path.includes("/") && !args.path.startsWith(".")) {
									// get npm package name from string, taking into account scoped packages
									const packageName = extractPackageName(args.path);
									if (!packageName) {
										throw new Error(
											`Unable to extract npm package name from ${args.path}`
										);
									}
									const packageJsonPath = path.join(
										process.cwd(),
										"node_modules",
										packageName,
										"package.json"
									);
									// Try and read the npm package's package.json
									// and then resolve the import against the package's exports
									// and then finally override filePath if we find a match.
									try {
										const packageJson = JSON.parse(
											await readFile(packageJsonPath, "utf8")
										);
										const testResolved = resolveExports(
											packageJson,
											args.path.replace(`${packageName}/`, ""),
											{
												conditions: getBuildConditions(),
											}
										);
										if (testResolved) {
											filePath = path.join(
												process.cwd(),
												"node_modules",
												packageName,
												testResolved[0]
											);
										}
									} catch (e) {
										// We tried, now it'll just fall-through to the previous behaviour
										// and ENOENT if the absolute file path doesn't exist.
									}
								}

								// Next try to resolve using the node module resolution algorithm
								try {
									const resolved = resolveSync(args.path, {
										basedir: args.resolveDir,
									});
									filePath = resolved;
								} catch (e) {
									// We tried, now it'll just fall-through to the previous behaviour
									// and ENOENT if the absolute file path doesn't exist.
								}

								// Finally, load the file and hash it
								// If we didn't do any smart resolution above, this will attempt to load as an absolute path
								const fileContent = await readFile(filePath);
								const fileHash = crypto
									.createHash("sha1")
									.update(fileContent)
									.digest("hex");
								const fileName = props.preserveFileNames
									? args.path
									: `./${fileHash}-${path.basename(args.path)}`;

								// add the module to the array
								modules.push({
									name: fileName,
									filePath,
									content: fileContent,
									type: RuleTypeToModuleType[rule.type],
								});

								return {
									path: fileName, // change the reference to the changed module
									external: props.entry.format === "modules", // mark it as external in the bundle
									namespace: `wrangler-module-${rule.type}`, // just a tag, this isn't strictly necessary
									watchFiles: [filePath], // we also add the file to esbuild's watch list
								};
							}
						);

						if (props.entry.format === "service-worker") {
							build.onLoad(
								{ filter: globToRegExp(glob) },
								async (args: esbuild.OnLoadArgs) => {
									return {
										// We replace the the module with an identifier
										// that we'll separately add to the form upload
										// as part of [wasm_modules]/[text_blobs]/[data_blobs]. This identifier has to be a valid
										// JS identifier, so we replace all non alphanumeric characters
										// with an underscore.
										contents: `export default ${args.path.replace(
											/[^a-zA-Z0-9_$]/g,
											"_"
										)};`,
									};
								}
							);
						}
					});
				});

				parsedRules.removedRules.forEach((rule) => {
					rule.globs.forEach((glob) => {
						build.onResolve(
							{ filter: globToRegExp(glob) },
							async (args: esbuild.OnResolveArgs) => {
								throw new UserError(
									`The file ${
										args.path
									} matched a module rule in your configuration (${JSON.stringify(
										rule
									)}), but was ignored because a previous rule with the same type was not marked as \`fallthrough = true\`.`
								);
							}
						);
					});
				});
			},
		},
	};
}

export function getWrangler1xLegacyModuleReferences(
	rootDirectory: string,
	entryPath: string
) {
	return {
		rootDirectory,
		fileNames: new Set(
			readdirSync(rootDirectory, { withFileTypes: true })
				.filter(
					(dirEntry) =>
						dirEntry.isFile() && dirEntry.name !== path.basename(entryPath)
				)
				.map((dirEnt) => dirEnt.name)
		),
	};
}

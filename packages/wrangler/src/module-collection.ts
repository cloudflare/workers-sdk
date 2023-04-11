import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import globToRegExp from "glob-to-regexp";
import { logger } from "./logger";
import type { Config, ConfigModuleRuleType } from "./config";
import type { CfModule, CfModuleType, CfScriptFormat } from "./worker";
import type esbuild from "esbuild";

function flipObject<
	K extends string | number | symbol,
	V extends string | number | symbol
>(obj: Record<K, V>): Record<V, K> {
	return Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]));
}

const RuleTypeToModuleType: Record<ConfigModuleRuleType, CfModuleType> = {
	ESModule: "esm",
	CommonJS: "commonjs",
	CompiledWasm: "compiled-wasm",
	Data: "buffer",
	Text: "text",
};

export const ModuleTypeToRuleType = flipObject(RuleTypeToModuleType);

// This is a combination of an esbuild plugin and a mutable array
// that we use to collect module references from source code.
// There will be modules that _shouldn't_ be inlined directly into
// the bundle. (eg. wasm modules, some text files, etc). We can include
// those files as modules in the multi part worker form upload. This
// plugin+array is used to collect references to these modules, reference
// them correctly in the bundle, and add them to the form upload.

export const DEFAULT_MODULE_RULES: Config["rules"] = [
	{ type: "Text", globs: ["**/*.txt", "**/*.html"] },
	{ type: "Data", globs: ["**/*.bin"] },
	{ type: "CompiledWasm", globs: ["**/*.wasm", "**/*.wasm?module"] },
];

export function parseRules(userRules: Config["rules"] = []) {
	const rules: Config["rules"] = [...userRules, ...DEFAULT_MODULE_RULES];

	const completedRuleLocations: Record<string, number> = {};
	let index = 0;
	const rulesToRemove: Config["rules"] = [];
	for (const rule of rules) {
		if (rule.type in completedRuleLocations) {
			if (rules[completedRuleLocations[rule.type]].fallthrough !== false) {
				if (index < userRules.length) {
					logger.warn(
						`The module rule at position ${index} (${JSON.stringify(
							rule
						)}) has the same type as a previous rule (at position ${
							completedRuleLocations[rule.type]
						}, ${JSON.stringify(
							rules[completedRuleLocations[rule.type]]
						)}). This rule will be ignored. To the previous rule, add \`fallthrough = true\` to allow this one to also be used, or \`fallthrough = false\` to silence this warning.`
					);
				} else {
					logger.warn(
						`The default module rule ${JSON.stringify(
							rule
						)} has the same type as a previous rule (at position ${
							completedRuleLocations[rule.type]
						}, ${JSON.stringify(
							rules[completedRuleLocations[rule.type]]
						)}). This rule will be ignored. To the previous rule, add \`fallthrough = true\` to allow the default one to also be used, or \`fallthrough = false\` to silence this warning.`
					);
				}
			}

			rulesToRemove.push(rule);
		}
		if (!(rule.type in completedRuleLocations) && rule.fallthrough !== true) {
			completedRuleLocations[rule.type] = index;
		}
		index++;
	}

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	rulesToRemove.forEach((rule) => rules!.splice(rules!.indexOf(rule), 1));

	return { rules, removedRules: rulesToRemove };
}

export async function matchFiles(
	files: string[],
	relativeTo: string,
	{
		rules,
		removedRules,
	}: { rules: Config["rules"]; removedRules: Config["rules"] }
) {
	const modules: CfModule[] = [];

	// Deduplicate modules. This is usually a poorly specified `wrangler.toml` configuration, but duplicate modules will cause a crash at runtime
	const moduleNames = new Set<string>();
	for (const rule of rules) {
		for (const glob of rule.globs) {
			const regexp = globToRegExp(glob, {
				globstar: true,
			});
			const newModules = await Promise.all(
				files
					.filter((f) => regexp.test(f))
					.map(async (name) => {
						const filePath = name;
						const fileContent = await readFile(path.join(relativeTo, filePath));

						return {
							name: filePath,
							content: fileContent,
							type: RuleTypeToModuleType[rule.type],
						};
					})
			);
			for (const module of newModules) {
				if (!moduleNames.has(module.name)) {
					moduleNames.add(module.name);
					modules.push(module);
				} else {
					logger.warn(
						`Ignoring duplicate module: ${chalk.blue(
							module.name
						)} (${chalk.green(module.type ?? "")})`
					);
				}
			}
		}
	}

	// This is just a sanity check verifying that no files match rules that were removed
	for (const rule of removedRules) {
		for (const glob of rule.globs) {
			const regexp = globToRegExp(glob);
			for (const file of files) {
				if (regexp.test(file)) {
					throw new Error(
						`The file ${file} matched a module rule in your configuration (${JSON.stringify(
							rule
						)}), but was ignored because a previous rule with the same type was not marked as \`fallthrough = true\`.`
					);
				}
			}
		}
	}
	return modules;
}

export default function createModuleCollector(props: {
	format: CfScriptFormat;
	rules?: Config["rules"];
	// a collection of "legacy" style module references, which are just file names
	// we will eventually deprecate this functionality, hence the verbose greppable name
	wrangler1xlegacyModuleReferences: {
		rootDirectory: string;
		fileNames: Set<string>;
	};
	preserveFileNames?: boolean;
}): {
	modules: CfModule[];
	plugin: esbuild.Plugin;
} {
	const { rules, removedRules } = parseRules(props.rules);

	const modules: CfModule[] = [];
	return {
		modules,
		plugin: {
			name: "wrangler-module-collector",
			setup(build) {
				build.onStart(() => {
					// reset the module collection array
					modules.splice(0);
				});

				// ~ start legacy module specifier support ~

				// This section detects usage of "legacy" 1.x style module specifiers
				// and modifies them so they "work" in wrangler v2, but with a warning

				const rulesMatchers = rules.flatMap((rule) => {
					return rule.globs.map((glob) => {
						const regex = globToRegExp(glob);
						return {
							regex,
							rule,
						};
					});
				});

				if (props.wrangler1xlegacyModuleReferences.fileNames.size > 0) {
					build.onResolve(
						{
							filter: new RegExp(
								"^(" +
									[...props.wrangler1xlegacyModuleReferences.fileNames]
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
								props.wrangler1xlegacyModuleReferences.rootDirectory,
								args.path
							);
							const fileContent = await readFile(filePath);
							const fileHash = crypto
								.createHash("sha1")
								.update(fileContent)
								.digest("hex");
							const fileName = `./${fileHash}-${path.basename(args.path)}`;

							const { rule } =
								rulesMatchers.find(({ regex }) => regex.test(fileName)) || {};
							if (rule) {
								// add the module to the array
								modules.push({
									name: fileName,
									content: fileContent,
									type: RuleTypeToModuleType[rule.type],
								});
								return {
									path: fileName, // change the reference to the changed module
									external: props.format === "modules", // mark it as external in the bundle
									namespace: `wrangler-module-${rule.type}`, // just a tag, this isn't strictly necessary
									watchFiles: [filePath], // we also add the file to esbuild's watch list
								};
							}
						}
					);
				}

				// ~ end legacy module specifier support ~

				rules?.forEach((rule) => {
					if (rule.type === "ESModule" || rule.type === "CommonJS") return; // TODO: we should treat these as js files, and use the jsx loader

					rule.globs.forEach((glob) => {
						build.onResolve(
							{ filter: globToRegExp(glob) },
							async (args: esbuild.OnResolveArgs) => {
								// take the file and massage it to a
								// transportable/manageable format

								const filePath = path.join(args.resolveDir, args.path);
								const fileContent = await readFile(filePath);
								const fileHash = crypto
									.createHash("sha1")
									.update(fileContent)
									.digest("hex");
								const fileName = props.preserveFileNames
									? filePath
									: `./${fileHash}-${path.basename(args.path)}`;

								// add the module to the array
								modules.push({
									name: fileName,
									content: fileContent,
									type: RuleTypeToModuleType[rule.type],
								});

								return {
									path: fileName, // change the reference to the changed module
									external: props.format === "modules", // mark it as external in the bundle
									namespace: `wrangler-module-${rule.type}`, // just a tag, this isn't strictly necessary
									watchFiles: [filePath], // we also add the file to esbuild's watch list
								};
							}
						);

						if (props.format === "service-worker") {
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

				removedRules.forEach((rule) => {
					rule.globs.forEach((glob) => {
						build.onResolve(
							{ filter: globToRegExp(glob) },
							async (args: esbuild.OnResolveArgs) => {
								throw new Error(
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

// Adapted from https://github.com/cloudflare/workers-sdk/blob/0a77990457652af36c60c52bf9c38c3a69945de4/packages/wrangler/src/module-collection.ts
import globToRegExp from "glob-to-regexp";

import type { TypedModule } from "./useDraftWorker";

type ConfigModuleRuleType =
	| "ESModule"
	| "CommonJS"
	| "CompiledWasm"
	| "Text"
	| "Data"
	| "PythonModule"
	| "PythonRequirement";

type CfModuleType =
	| "esm"
	| "commonjs"
	| "compiled-wasm"
	| "text"
	| "buffer"
	| "python"
	| "python-requirement";

type Rule = {
	type: ConfigModuleRuleType;
	globs: string[];
	fallthrough?: boolean;
};

/**
 * An imported module.
 */
export interface CfModule {
	/**
	 * The module name.
	 *
	 * @example
	 * './src/index.js'
	 */
	name: string;
	/**
	 * The module content, usually JavaScript or WASM code.
	 *
	 * @example
	 * export default {
	 *   async fetch(request) {
	 *     return new Response('Ok')
	 *   }
	 * }
	 */
	content: TypedModule;
	/**
	 * The module type.
	 *
	 * If absent, will default to the main module's type.
	 */
	type?: CfModuleType;
}

function flipObject<
	K extends string | number | symbol,
	V extends string | number | symbol,
>(obj: Record<K, V>): Record<V, K> {
	return Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]));
}

const RuleTypeToModuleType: Record<ConfigModuleRuleType, CfModuleType> = {
	ESModule: "esm",
	CommonJS: "commonjs",
	CompiledWasm: "compiled-wasm",
	Data: "buffer",
	Text: "text",
	PythonModule: "python",
	PythonRequirement: "python-requirement",
};

export const ModuleTypeToRuleType = flipObject(RuleTypeToModuleType);

export const DEFAULT_MODULE_RULES: Rule[] = [
	{ type: "Text", globs: ["**/*.txt", "**/*.html"] },
	{ type: "Data", globs: ["**/*.bin"] },
	{ type: "CompiledWasm", globs: ["**/*.wasm"] },
	{ type: "ESModule", globs: ["**/*.js"] },
	{ type: "PythonModule", globs: ["**/*.py"] },
];

export function toMimeType(type: CfModuleType): string {
	switch (type) {
		case "esm":
			return "application/javascript+module";
		case "commonjs":
			return "application/javascript";
		case "compiled-wasm":
			return "application/wasm";
		case "buffer":
			return "application/octet-stream";
		case "text":
			return "text/plain";
		case "python":
			return "text/x-python";
		default:
			throw new TypeError(`Unsupported module: ${type}`);
	}
}

export function parseRules(userRules: Rule[] = []) {
	const rules: Rule[] = [...userRules, ...DEFAULT_MODULE_RULES];

	const completedRuleLocations: Record<string, number> = {};
	let index = 0;
	const rulesToRemove: Rule[] = [];
	for (const rule of rules) {
		if (rule.type in completedRuleLocations) {
			// These warnings aren't user facing, since setting of module rules isn't currently user-facing
			if (rules[completedRuleLocations[rule.type]].fallthrough !== false) {
				if (index < userRules.length) {
					console.warn(
						`The module rule at position ${index} (${JSON.stringify(
							rule
						)}) has the same type as a previous rule (at position ${
							completedRuleLocations[rule.type]
						}, ${JSON.stringify(
							rules[completedRuleLocations[rule.type]]
						)}). This rule will be ignored. To use the previous rule, add \`fallthrough = true\` to allow this one to also be used, or \`fallthrough = false\` to silence this warning.`
					);
				} else {
					console.warn(
						`The default module rule ${JSON.stringify(
							rule
						)} has the same type as a previous rule (at position ${
							completedRuleLocations[rule.type]
						}, ${JSON.stringify(
							rules[completedRuleLocations[rule.type]]
						)}). This rule will be ignored. To use the previous rule, add \`fallthrough = true\` to allow the default one to also be used, or \`fallthrough = false\` to silence this warning.`
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

	rulesToRemove.forEach((rule) => rules.splice(rules.indexOf(rule), 1));

	return { rules, removedRules: rulesToRemove };
}

export function matchFiles(
	files: Record<string, TypedModule>,
	{ rules, removedRules }: { rules: Rule[]; removedRules: Rule[] }
): CfModule[] {
	const modules: Record<string, CfModule> = {};
	const filenames = Object.keys(files);

	for (const rule of rules) {
		for (const glob of rule.globs) {
			const regexp = globToRegExp(glob, {
				globstar: true,
			});
			const newModules = filenames
				.filter((f) => regexp.test(f))
				.map((name) => {
					return {
						name: name,
						content: files[name],
						type: RuleTypeToModuleType[rule.type],
					};
				});
			for (const module of newModules) {
				if (!modules[module.name]) {
					modules[module.name] = module;
				} else {
					console.warn(
						`Ignoring duplicate module: ${module.name} (${module.type ?? ""})`
					);
				}
			}
		}
	}

	// This is just a sanity check verifying that no files match rules that were removed
	for (const rule of removedRules) {
		for (const glob of rule.globs) {
			const regexp = globToRegExp(glob);
			for (const file of filenames) {
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

	// Ensure pre-existing modules _with_ mime types are preserved, even if they don't match a module rule.
	const preTypedModules = Object.fromEntries(
		Object.entries(files)
			.filter((f) => !!f[1].type)
			.map((f) => [
				f[0],
				{
					name: f[0],
					content: f[1],
				},
			])
	);

	return Object.values({ ...preTypedModules, ...modules });
}

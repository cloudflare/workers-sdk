import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import globToRegExp from "glob-to-regexp";
import { logger } from "../logger";
import { RuleTypeToModuleType } from "./module-collection";
import { parseRules } from "./rules";
import type { Rule } from "../config/environment";
import type { Entry } from "./entry";
import type { ParsedRules } from "./rules";
import type { CfModule } from "./worker";

async function getFiles(root: string, relativeTo: string): Promise<string[]> {
	const files = [];
	for (const file of await readdir(root, { withFileTypes: true })) {
		if (file.isDirectory()) {
			files.push(...(await getFiles(path.join(root, file.name), relativeTo)));
		} else {
			// Module names should always use `/`. This is also required to match globs correctly on Windows. Later code will
			// `path.resolve()` with these names to read contents which will perform appropriate normalisation.
			files.push(
				path
					.relative(relativeTo, path.join(root, file.name))
					.replaceAll("\\", "/")
			);
		}
	}
	return files;
}

/**
 * Search the filesystem under the `moduleRoot` of the `entry` for potential additional modules
 * that match the given `rules`.
 */
export async function findAdditionalModules(
	entry: Entry,
	rules: Rule[] | ParsedRules
): Promise<CfModule[]> {
	const files = await getFiles(entry.moduleRoot, entry.moduleRoot);
	const relativeEntryPoint = path
		.relative(entry.moduleRoot, entry.file)
		.replaceAll("\\", "/");

	if (Array.isArray(rules)) rules = parseRules(rules);
	const modules = (await matchFiles(files, entry.moduleRoot, rules))
		.filter((m) => m.name !== relativeEntryPoint)
		.map((m) => ({
			...m,
			name: m.name,
		}));

	if (modules.length > 0) {
		logger.info(`Attaching additional modules:`);
		modules.forEach(({ name, type }) => {
			logger.info(`- ${chalk.blue(name)} (${chalk.green(type ?? "")})`);
		});
	}

	return modules;
}

async function matchFiles(
	files: string[],
	relativeTo: string,
	{ rules, removedRules }: ParsedRules
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
							filePath,
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

/**
 * Recursively finds all directories contained within and including `root`,
 * that should be watched for additional modules. Excludes `node_modules` and
 * `.git` folders in case the root is the project root, to avoid watching too
 * much.
 */
export async function* findAdditionalModuleWatchDirs(
	root: string
): AsyncGenerator<string> {
	yield root;
	for (const entry of await readdir(root, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === ".git") continue;
			yield* findAdditionalModuleWatchDirs(path.join(root, entry.name));
		}
	}
}

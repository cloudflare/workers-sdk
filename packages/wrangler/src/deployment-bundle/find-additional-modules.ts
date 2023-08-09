import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import globToRegExp from "glob-to-regexp";
import { logger } from "../logger";
import { parseRules, RuleTypeToModuleType } from "./module-collection";
import type { Rule } from "../config/environment";
import type { Entry } from "./entry";
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
export default async function findAdditionalModules(
	entry: Entry,
	rules: Rule[]
): Promise<CfModule[]> {
	const files = await getFiles(entry.moduleRoot, entry.moduleRoot);
	const relativeEntryPoint = path
		.relative(entry.moduleRoot, entry.file)
		.replaceAll("\\", "/");

	const modules = (await matchFiles(files, entry.moduleRoot, parseRules(rules)))
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
	{ rules, removedRules }: { rules: Rule[]; removedRules: Rule[] }
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

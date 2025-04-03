import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import globToRegExp from "glob-to-regexp";
import { UserError } from "../errors";
import { logger } from "../logger";
import { getBundleType } from "./bundle-type";
import { RuleTypeToModuleType } from "./module-collection";
import { parseRules } from "./rules";
import { tryAttachSourcemapToModule } from "./source-maps";
import type { Rule } from "../config/environment";
import type { Entry } from "./entry";
import type { ParsedRules } from "./rules";
import type { CfModule } from "./worker";

async function* getFiles(
	root: string,
	relativeTo: string
): AsyncGenerator<string> {
	for (const file of await readdir(root, { withFileTypes: true })) {
		if (file.isDirectory()) {
			yield* getFiles(path.join(root, file.name), relativeTo);
		} else {
			// Module names should always use `/`. This is also required to match globs correctly on Windows. Later code will
			// `path.resolve()` with these names to read contents which will perform appropriate normalisation.
			yield path
				.relative(relativeTo, path.join(root, file.name))
				.replaceAll("\\", "/");
		}
	}
}

/**
 * Checks if a given string is a valid Python package identifier.
 * See https://packaging.python.org/en/latest/specifications/name-normalization/
 * @param name The package name to validate
 */
function isValidPythonPackageName(name: string): boolean {
	const regex = /^([A-Z0-9]|[A-Z0-9][A-Z0-9._-]*[A-Z0-9])$/i;
	return regex.test(name);
}

/**
 * Search the filesystem under the `moduleRoot` of the `entry` for potential additional modules
 * that match the given `rules`.
 */
export async function findAdditionalModules(
	entry: Entry,
	rules: Rule[] | ParsedRules,
	attachSourcemaps = false
): Promise<CfModule[]> {
	const files = getFiles(entry.moduleRoot, entry.moduleRoot);
	const relativeEntryPoint = path
		.relative(entry.moduleRoot, entry.file)
		.replaceAll("\\", "/");

	if (Array.isArray(rules)) {
		rules = parseRules(rules);
	}
	const modules = (await matchFiles(files, entry.moduleRoot, rules))
		.filter((m) => m.name !== relativeEntryPoint)
		.map((m) => ({
			...m,
			name: m.name,
		}));

	// Try to find a requirements.txt file
	const isPythonEntrypoint =
		getBundleType(entry.format, entry.file) === "python";

	if (isPythonEntrypoint) {
		let pythonRequirements = "";
		try {
			pythonRequirements = await readFile(
				path.resolve(entry.projectRoot, "requirements.txt"),
				"utf-8"
			);
		} catch (e) {
			// We don't care if a requirements.txt isn't found
			logger.debug(
				"Python entrypoint detected, but no requirements.txt file found."
			);
		}

		for (const requirement of pythonRequirements.split("\n")) {
			if (requirement === "") {
				continue;
			}
			if (!isValidPythonPackageName(requirement)) {
				throw new UserError(
					`Invalid Python package name "${requirement}" found in requirements.txt. Note that requirements.txt should contain package names only, not version specifiers.`
				);
			}

			modules.push({
				type: "python-requirement",
				name: requirement,
				content: "",
				filePath: undefined,
			});
		}
	}

	// The modules we find might also have sourcemaps associated with them, so when we go to copy
	// them into the output directory we need to preserve the sourcemaps.
	if (attachSourcemaps) {
		modules.forEach((module) => tryAttachSourcemapToModule(module));
	}

	if (modules.length > 0) {
		logger.info(`Attaching additional modules:`);
		const totalSize = modules.reduce(
			(previous, { content }) => previous + content.length,
			0
		);

		logger.table([
			...modules.map(({ name, type, content }) => {
				return {
					Name: name,
					Type: type ?? "",
					Size:
						type === "python-requirement"
							? ""
							: `${(content.length / 1024).toFixed(2)} KiB`,
				};
			}),
			{
				Name: `Total (${modules.length} module${modules.length > 1 ? "s" : ""})`,
				Type: "",
				Size: `${(totalSize / 1024).toFixed(2)} KiB`,
			},
		]);
	}

	return modules;
}

async function matchFiles(
	files: AsyncGenerator<string>,
	relativeTo: string,
	{ rules, removedRules }: ParsedRules
) {
	const modules: CfModule[] = [];

	// Use the `moduleNames` set to deduplicate modules.
	// This is usually a poorly specified Wrangler configuration file, but duplicate modules will cause a crash at runtime
	const moduleNames = new Set<string>();

	for await (const filePath of files) {
		for (const rule of rules) {
			for (const glob of rule.globs) {
				const regexp = globToRegExp(glob, {
					globstar: true,
				});
				if (!regexp.test(filePath)) {
					continue;
				}
				const absoluteFilePath = path.join(relativeTo, filePath);
				const fileContent = (await readFile(
					absoluteFilePath
				)) as Buffer<ArrayBuffer>;

				const module = {
					name: filePath,
					content: fileContent,
					filePath: absoluteFilePath,
					type: RuleTypeToModuleType[rule.type],
				};

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

		// This is just a sanity check verifying that no files match rules that were removed
		for (const rule of removedRules) {
			for (const glob of rule.globs) {
				const regexp = globToRegExp(glob);
				if (regexp.test(filePath)) {
					throw new UserError(
						`The file ${filePath} matched a module rule in your configuration (${JSON.stringify(
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
			if (entry.name === "node_modules" || entry.name === ".git") {
				continue;
			}
			yield* findAdditionalModuleWatchDirs(path.join(root, entry.name));
		}
	}
}

/**
 * When we are writing files to an `outDir`, this function ensures that any additional
 * modules that were found (by matching rules) are also copied to the destination directory.
 */
export async function writeAdditionalModules(
	modules: CfModule[],
	destination: string
): Promise<void> {
	for (const module of modules) {
		const modulePath = path.resolve(destination, module.name);
		logger.debug("Writing additional module to output", modulePath);
		await mkdir(path.dirname(modulePath), { recursive: true });
		await writeFile(modulePath, module.content);

		if (module.sourceMap) {
			const sourcemapPath = path.resolve(destination, module.sourceMap.name);
			await writeFile(sourcemapPath, module.sourceMap.content);
		}
	}
}

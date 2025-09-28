import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import globToRegExp from "glob-to-regexp";
import { UserError } from "../errors";
import { logger } from "../logger";
import { getWranglerHiddenDirPath } from "../paths";
import { getBundleType } from "./bundle-type";
import { RuleTypeToModuleType } from "./module-collection";
import { parseRules } from "./rules";
import { tryAttachSourcemapToModule } from "./source-maps";
import type { Rule } from "../config/environment";
import type { Entry } from "./entry";
import type { ParsedRules } from "./rules";
import type { CfModule } from "./worker";

async function* getFiles(
	configPath: string | undefined,
	moduleRoot: string,
	relativeTo: string,
	projectRoot: string
): AsyncGenerator<string> {
	const wranglerHiddenDirPath = getWranglerHiddenDirPath(projectRoot);
	for (const file of await readdir(moduleRoot, { withFileTypes: true })) {
		const absPath = path.join(moduleRoot, file.name);
		if (file.isDirectory()) {
			// Skip the hidden Wrangler directory so we don't accidentally bundle non-user files.
			if (absPath !== wranglerHiddenDirPath) {
				yield* getFiles(configPath, absPath, relativeTo, projectRoot);
			}
		} else {
			// don't bundle the wrangler config file
			if (absPath !== configPath) {
				// Module names should always use `/`. This is also required to match globs correctly on Windows. Later code will
				// `path.resolve()` with these names to read contents which will perform appropriate normalisation.
				yield path.relative(relativeTo, absPath).replaceAll("\\", "/");
			}
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

function filterPythonVendorModules(
	isPythonEntrypoint: boolean,
	modules: CfModule[]
): CfModule[] {
	if (!isPythonEntrypoint) {
		return modules;
	}
	return modules.filter((m) => !m.name.startsWith("python_modules" + path.sep));
}

function getPythonVendorModulesSize(modules: CfModule[]): number {
	const vendorModules = modules.filter((m) =>
		m.name.startsWith("python_modules" + path.sep)
	);
	return vendorModules.reduce((total, m) => total + m.content.length, 0);
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
	const files = getFiles(
		entry.configPath,
		entry.moduleRoot,
		entry.moduleRoot,
		entry.projectRoot
	);
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

	// Try to find a cf-requirements.txt file
	const isPythonEntrypoint =
		getBundleType(entry.format, entry.file) === "python";

	if (isPythonEntrypoint) {
		let pythonRequirements = "";
		try {
			pythonRequirements = await readFile(
				path.resolve(entry.projectRoot, "cf-requirements.txt"),
				"utf-8"
			);
		} catch {
			// We don't care if a cf-requirements.txt isn't found
			logger.debug(
				"Python entrypoint detected, but no cf-requirements.txt file found."
			);
		}

		// If a `requirements.txt` file is found, show a warning instructing user to use `cf-requirements.txt` instead.
		if (existsSync(path.resolve(entry.projectRoot, "requirements.txt"))) {
			logger.warn(
				"Found a `requirements.txt` file. Python requirements should now be in a `cf-requirements.txt` file."
			);
		}

		for (const requirement of pythonRequirements.split("\n")) {
			if (requirement === "") {
				continue;
			}
			if (!isValidPythonPackageName(requirement)) {
				throw new UserError(
					`Invalid Python package name "${requirement}" found in cf-requirements.txt. Note that cf-requirements.txt should contain package names only, not version specifiers.`
				);
			}

			modules.push({
				type: "python-requirement",
				name: requirement,
				content: "",
				filePath: undefined,
			});
		}

		// Look for a `python_modules` directory in the root of the project and add all the .py and .so files in it
		const pythonModulesDir = path.resolve(entry.projectRoot, "python_modules");
		const pythonModulesDirInModuleRoot = path.resolve(
			entry.moduleRoot,
			"python_modules"
		);

		// Check for conflict between a `python_modules` directory in the module root and the project root.
		const pythonModulesExistsInModuleRoot = existsSync(
			pythonModulesDirInModuleRoot
		);
		if (
			pythonModulesExistsInModuleRoot &&
			entry.projectRoot !== entry.moduleRoot
		) {
			throw new UserError(
				"The 'python_modules' directory cannot exist in your module root. Delete it to continue."
			);
		}

		const pythonModulesExists = existsSync(pythonModulesDir);
		if (pythonModulesExists) {
			const pythonModulesFiles = getFiles(
				entry.file,
				pythonModulesDir,
				pythonModulesDir,
				entry.projectRoot
			);
			const vendoredRules: Rule[] = [
				{ type: "Data", globs: ["**/*"], fallthrough: true },
			];
			const vendoredModules = (
				await matchFiles(
					pythonModulesFiles,
					pythonModulesDir,
					parseRules(vendoredRules)
				)
			).map((m) => {
				const prefixedPath = path.join("python_modules", m.name);
				return {
					...m,
					name: prefixedPath,
				};
			});

			modules.push(...vendoredModules);
		} else {
			logger.debug(
				"Python entrypoint detected, but no python_modules directory found."
			);
		}
	}

	// The modules we find might also have sourcemaps associated with them, so when we go to copy
	// them into the output directory we need to preserve the sourcemaps.
	if (attachSourcemaps) {
		modules.forEach((module) => tryAttachSourcemapToModule(module));
	}

	if (modules.length > 0) {
		logger.info(`Attaching additional modules:`);
		const filteredModules = filterPythonVendorModules(
			isPythonEntrypoint,
			modules
		);
		const vendorModulesSize = getPythonVendorModulesSize(modules);

		const totalSize = modules.reduce(
			(previous, { content }) => previous + content.length,
			0
		);

		const tableEntries = [
			...filteredModules.map(({ name, type, content }) => {
				return {
					Name: name,
					Type: type ?? "",
					Size:
						type === "python-requirement"
							? ""
							: `${(content.length / 1024).toFixed(2)} KiB`,
				};
			}),
		];

		if (isPythonEntrypoint && vendorModulesSize > 0) {
			tableEntries.push({
				Name: "Vendored Modules",
				Type: "",
				Size: `${(vendorModulesSize / 1024).toFixed(2)} KiB`,
			});
		}

		tableEntries.push({
			Name: `Total (${modules.length} module${modules.length > 1 ? "s" : ""})`,
			Type: "",
			Size: `${(totalSize / 1024).toFixed(2)} KiB`,
		});

		logger.table(tableEntries);
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

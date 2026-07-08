import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
	getInstalledPackageVersion,
	getPackagePath,
	parsePackageJSON,
} from "@cloudflare/workers-utils";
import { logger } from "../../shared/context";

/**
 * A single npm package dependency entry, matching the upload API schema
 * see: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update.
 */
export type PackageDependency = {
	/** The npm package name, e.g. "lodash" or "@cloudflare/workers-types". */
	name: string;
	/** The version constraint as written in package.json, e.g. "^4.17.21". */
	packageJsonVersion: string;
	/** The exact version resolved and installed by the package manager, e.g. "4.17.22". */
	installedVersion: string;
};

/**
 * Maximum number of dependency entries to include in a single upload.
 * This also gets truncated to this limit server-side, but we cap client-side
 * to avoid sending unnecessarily large payloads.
 */
const MAX_PACKAGE_DEPENDENCIES = 200;

/**
 * Collects npm package dependency metadata from the project's package.json.
 *
 * Reads both `dependencies` and `devDependencies`, resolves each package's
 * installed version from node_modules, and filters out:
 * - Workspace packages (version prefixed with `workspace:`)
 * - Pnpm catalog packages (version prefixed with `catalog:`)
 * - Local packages (version prefixed with `file:` or `link:`)
 * - Private packages (`"private": true` in the package's own package.json)
 * - Packages whose installed version cannot be resolved
 *
 * The result is capped at {@link MAX_PACKAGE_DEPENDENCIES} entries.
 *
 * @param projectPath - Path to the project directory (where package.json is located)
 * @returns An array of package dependency entries, or `undefined` if package.json
 *          cannot be read or no valid dependencies are found
 */
export async function collectPackageDependencies(
	projectPath: string
): Promise<PackageDependency[] | undefined> {
	const packageJsonPath = path.join(projectPath, "package.json");

	try {
		await access(packageJsonPath);
	} catch {
		return undefined;
	}

	try {
		const content = await readFile(packageJsonPath, "utf-8");
		const packageJson = parsePackageJSON(content, packageJsonPath);

		const allDependencies = {
			...packageJson.dependencies,
			...packageJson.devDependencies,
		} as Record<string, string>;

		const result: PackageDependency[] = [];

		for (const [dependencyName, packageJsonVersion] of Object.entries(
			allDependencies
		)) {
			if (result.length >= MAX_PACKAGE_DEPENDENCIES) {
				break;
			}

			if (
				packageJsonVersion.startsWith("workspace:") ||
				packageJsonVersion.startsWith("catalog:") ||
				packageJsonVersion.startsWith("file:") ||
				packageJsonVersion.startsWith("link:")
			) {
				continue;
			}

			const installedVersion = getInstalledPackageVersion(
				dependencyName,
				projectPath
			);

			if (!installedVersion) {
				continue;
			}

			if (await isPackagePrivate(dependencyName, projectPath)) {
				continue;
			}

			result.push({
				name: dependencyName,
				packageJsonVersion,
				installedVersion,
			});
		}

		return result.length > 0 ? result : undefined;
	} catch (error) {
		logger.debug(
			`Failed to collect package dependencies: ${error instanceof Error ? error.message : error}`
		);
		return undefined;
	}
}

/**
 * Checks whether a package is marked as private in its own package.json.
 *
 * Resolves the package from the project's node_modules and reads its
 * package.json to check the `private` field.
 *
 * @param packageName - Name of the npm package to check
 * @param projectPath - Path to the project directory
 * @returns `true` if the package has `"private": true`, `false` otherwise
 */
async function isPackagePrivate(
	packageName: string,
	projectPath: string
): Promise<boolean> {
	try {
		const packagePath = getPackagePath(packageName, projectPath);
		if (!packagePath) {
			return false;
		}

		// Walk up from the resolved path to find the package's package.json
		let currentDir = packagePath;
		const root = path.parse(currentDir).root;

		while (currentDir !== root) {
			const potentialPackageJson = path.join(currentDir, "package.json");
			try {
				await access(potentialPackageJson);
				const content = await readFile(potentialPackageJson, "utf-8");
				const packageJson = parsePackageJSON(content, potentialPackageJson);

				if (packageJson.name === packageName) {
					return packageJson.private === true;
				}
			} catch {
				// package.json doesn't exist at this level, keep walking up
			}
			currentDir = path.dirname(currentDir);
		}

		return false;
	} catch {
		return false;
	}
}

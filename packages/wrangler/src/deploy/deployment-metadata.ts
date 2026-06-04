import { existsSync } from "node:fs";
import path from "node:path";
import { getInstalledPackageVersion } from "@cloudflare/autoconfig";
import { parsePackageJSON, readFileSync } from "@cloudflare/workers-utils";
import { logger } from "../logger";

/**
 * A single npm package dependency entry, matching the EWC API schema.
 * Field names are camelCase to match the EWC Go struct JSON tags.
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
 * EWC will also truncate to this limit server-side, but we cap client-side
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
 * - Private packages (`"private": true` in the package's own package.json)
 * - Packages whose installed version cannot be resolved
 *
 * The result is capped at {@link MAX_PACKAGE_DEPENDENCIES} entries.
 *
 * @param projectPath - Path to the project directory (where package.json is located)
 * @returns An array of package dependency entries, or `undefined` if package.json
 *          cannot be read or no valid dependencies are found
 */
export function collectPackageDependencies(
	projectPath: string
): PackageDependency[] | undefined {
	const packageJsonPath = path.join(projectPath, "package.json");

	if (!existsSync(packageJsonPath)) {
		return undefined;
	}

	try {
		const content = readFileSync(packageJsonPath);
		const packageJson = parsePackageJSON(content, packageJsonPath);

		const allDependencies: Record<string, string> = {
			...toStringRecord(packageJson.dependencies),
			...toStringRecord(packageJson.devDependencies),
		};

		const result: PackageDependency[] = [];

		for (const [dependencyName, packageJsonVersion] of Object.entries(
			allDependencies
		)) {
			if (result.length >= MAX_PACKAGE_DEPENDENCIES) {
				break;
			}

			if (
				packageJsonVersion.startsWith("workspace:") ||
				packageJsonVersion.startsWith("catalog:")
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

			if (isPackagePrivate(dependencyName, projectPath)) {
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
 * Converts a `Record<string, unknown>` (as typed in PackageJSON) to
 * a `Record<string, string>`, filtering out any non-string values.
 *
 * @param record - The record to convert
 * @returns A new record containing only string-valued entries
 */
function toStringRecord(
	record: Record<string, unknown> | undefined
): Record<string, string> {
	if (!record) {
		return {};
	}
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(record)) {
		if (typeof value === "string") {
			result[key] = value;
		}
	}
	return result;
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
function isPackagePrivate(packageName: string, projectPath: string): boolean {
	try {
		const packageEntryPath = require.resolve(packageName, {
			paths: [projectPath],
		});

		// Walk up from the resolved entry point to find the package's package.json
		let currentDir = path.dirname(packageEntryPath);
		const root = path.parse(currentDir).root;

		while (currentDir !== root) {
			const potentialPackageJson = path.join(currentDir, "package.json");
			if (existsSync(potentialPackageJson)) {
				const content = readFileSync(potentialPackageJson);
				const packageJson = parsePackageJSON(content, potentialPackageJson);

				if (packageJson.name === packageName) {
					return packageJson.private === true;
				}
			}
			currentDir = path.dirname(currentDir);
		}

		return false;
	} catch {
		return false;
	}
}

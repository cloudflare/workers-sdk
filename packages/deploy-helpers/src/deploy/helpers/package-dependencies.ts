import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
	getInstalledPackageVersion,
	parsePackageJSON,
} from "@cloudflare/workers-utils";
import { logger } from "../../shared/context";
import type { LockfileCache } from "@cloudflare/workers-utils";

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

		// Create a function-scoped cache so the lockfile is parsed once and
		// shared across all per-package lookups within this single collection
		// pass. The cache is garbage-collected when this function returns.
		const lockfileCache: LockfileCache = new Map();

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
				projectPath,
				{ cache: lockfileCache }
			);

			if (!installedVersion) {
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

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parsePackageJSON } from "@cloudflare/workers-utils";
import { version as wranglerVersion } from "../../package.json";
import { getInstalledPackageVersion } from "../autoconfig/frameworks/utils/packages";
import { sniffUserAgent } from "../package-manager";

/**
 * Metadata about the deployment collected by wrangler and sent to the Cloudflare API.
 */
export type DeploymentMetadata = {
	/** Version of wrangler used for deployment */
	wrangler_version: string;
	/** Package manager used (npm, pnpm, yarn, or bun). `undefined` if detection fails */
	package_manager?: "npm" | "pnpm" | "yarn" | "bun";
	/** Project dependencies (name -> version info). `undefined` if detection fails */
	project_dependencies?: Record<
		string,
		{
			/** The version specifier from package.json (e.g., "^4.0.0") */
			package_json_version: string;
			/** The actual installed version (e.g., "4.0.5") */
			installed_version: string;
		}
	>;
};

/**
 * Collects deployment metadata to be sent with the worker upload.
 *
 * This metadata is sent with every deployment to help Cloudflare
 * understand what tools and dependencies are being used.
 *
 * @param projectPath Path to the project directory (where package.json is located)
 * @returns Deployment metadata object
 */
export async function collectDeploymentMetadata(
	projectPath: string
): Promise<DeploymentMetadata> {
	return {
		wrangler_version: wranglerVersion,
		package_manager: sniffUserAgent(),
		project_dependencies: await getProjectDependencies(projectPath),
	};
}

/**
 * Gets the production dependencies from the project's package.json, filtered to exclude:
 * - Workspace packages (version starts with "workspace:")
 * - Private packages (package.json has "private": true)
 * - Packages whose installed version cannot be detected
 *
 * @param projectPath Path to the project directory
 * @returns Object mapping dependency names to version info, or undefined if package.json cannot be read
 */
async function getProjectDependencies(
	projectPath: string
): Promise<DeploymentMetadata["project_dependencies"]> {
	const packageJsonPath = path.join(projectPath, "package.json");

	if (!existsSync(packageJsonPath)) {
		return undefined;
	}

	try {
		const content = readFileSync(packageJsonPath, "utf-8");
		const packageJson = parsePackageJSON(content, packageJsonPath);

		const dependencies = packageJson.dependencies ?? {};
		const result: NonNullable<DeploymentMetadata["project_dependencies"]> = {};

		for (const [dependencyName, packageJsonVersion] of Object.entries(
			dependencies
		)) {
			// Skip workspace packages
			if (packageJsonVersion.startsWith("workspace:")) {
				continue;
			}

			// Get the installed version
			const installedVersion = getInstalledPackageVersion(
				dependencyName,
				projectPath
			);

			if (!installedVersion) {
				// Skip if we can't detect the installed version
				continue;
			}

			// Check if the package is private by reading its package.json
			const isPrivate = isPackagePrivate(dependencyName, projectPath);
			if (isPrivate) {
				continue;
			}

			result[dependencyName] = {
				package_json_version: packageJsonVersion,
				installed_version: installedVersion,
			};
		}

		return Object.keys(result).length > 0 ? result : undefined;
	} catch {
		// Silently ignore errors - package.json may be malformed or unreadable
		return undefined;
	}
}

/**
 * Checks if a package is marked as private in its package.json.
 *
 * @param packageName Name of the package to check
 * @param projectPath Path to the project directory
 * @returns true if the package is private, false otherwise
 */
function isPackagePrivate(packageName: string, projectPath: string): boolean {
	try {
		// Resolve the package's main entry point
		const packageEntryPath = require.resolve(packageName, {
			paths: [projectPath],
		});

		// Find the package.json by walking up from the entry point
		let currentDir = path.dirname(packageEntryPath);
		const root = path.parse(currentDir).root;

		while (currentDir !== root) {
			const potentialPackageJson = path.join(currentDir, "package.json");
			if (existsSync(potentialPackageJson)) {
				const content = readFileSync(potentialPackageJson, "utf-8");
				const packageJson = parsePackageJSON(content, potentialPackageJson);

				// Verify this is the correct package by checking the name
				if (packageJson.name === packageName) {
					return packageJson.private === true;
				}
			}
			currentDir = path.dirname(currentDir);
		}

		return false;
	} catch {
		// If we can't resolve the package, assume it's not private
		return false;
	}
}

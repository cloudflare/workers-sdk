import { statSync } from "node:fs";
import path from "node:path";
import { parsePackageJSON, readFileSync } from "./parse";

/**
 * Resolves the filesystem path for an installed npm package.
 *
 * Tries two strategies:
 * 1. `require.resolve("<pkg>/package.json")` -- works when the package exports its package.json
 * 2. `require.resolve("<pkg>")` -- fallback for packages that don't export package.json
 *
 * @param packageName - The npm package name to resolve
 * @param projectPath - The project directory to resolve from
 * @returns The resolved directory path, or `undefined` if the package is not installed
 */
export function getPackagePath(
	packageName: string,
	projectPath: string
): string | undefined {
	try {
		// Try to resolve the package.json directly — works when the package exports it
		return path.dirname(
			require.resolve(`${packageName}/package.json`, {
				paths: [projectPath],
			})
		);
	} catch {}

	try {
		// Fallback: resolve the package entry point
		return require.resolve(packageName, {
			paths: [projectPath],
		});
	} catch {}

	return undefined;
}

/**
 * Checks whether an npm package is installed in a target project.
 *
 * @param packageName - The name of the target package
 * @param projectPath - The path of the project to check
 * @returns `true` if the package is installed, `false` otherwise
 */
export function isPackageInstalled(
	packageName: string,
	projectPath: string
): boolean {
	return !!getPackagePath(packageName, projectPath);
}

/**
 * Gets the exact version of an npm package installed in a project by resolving
 * it from node_modules and reading its package.json.
 *
 * @param packageName - The name of the target package
 * @param projectPath - The path of the project to check
 * @param opts - Options
 * @param opts.stopAtProjectPath - If `true`, stop walking up at the project's path
 * @returns The installed version string, or `undefined` if the package is not installed
 */
export function getInstalledPackageVersion(
	packageName: string,
	projectPath: string,
	opts: {
		stopAtProjectPath?: boolean;
	} = {}
): string | undefined {
	try {
		const packagePath = getPackagePath(packageName, projectPath);
		if (!packagePath) {
			return undefined;
		}

		const lastDir = opts.stopAtProjectPath === true ? projectPath : undefined;
		const packageJsonPath = findFileUp("package.json", packagePath, lastDir);

		if (!packageJsonPath) {
			return undefined;
		}

		const packageJson = parsePackageJSON(
			readFileSync(packageJsonPath),
			packageJsonPath
		);
		return packageJson.version;
	} catch {}
}

/**
 * Walks up from `startDir` looking for a file named `name`.
 * Stops at `lastDir` (inclusive) if provided, otherwise walks to the filesystem root.
 *
 * @param name - The filename to search for
 * @param startDir - The directory to start searching from
 * @param lastDir - If provided, stop searching after reaching this directory
 * @returns The full path to the found file, or `undefined`
 */
function findFileUp(
	name: string,
	startDir: string,
	lastDir?: string
): string | undefined {
	let dir = startDir;
	const root = path.parse(dir).root;

	while (true) {
		const candidate = path.join(dir, name);
		try {
			if (statSync(candidate).isFile()) {
				return candidate;
			}
		} catch {}

		if (lastDir !== undefined && dir === lastDir) {
			break;
		}

		const parent = path.dirname(dir);
		if (parent === dir || dir === root) {
			break;
		}
		dir = parent;
	}

	return undefined;
}

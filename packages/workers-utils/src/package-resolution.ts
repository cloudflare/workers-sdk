import { statSync } from "node:fs";
import path from "node:path";
import { parsePackageJSON, readFileSync } from "./parse";

/**
 * Resolves the filesystem path for an installed npm package.
 *
 * Tries three strategies in order:
 * 1. `require.resolve("<pkg>/package.json")` — works when the package exports its `package.json`
 * 2. `require.resolve("<pkg>")` — fallback for packages that don't export `package.json`
 * 3. Direct `node_modules` filesystem lookup — fallback for ESM-only packages whose exports
 *    map has no `"require"` or `"default"` condition (and no `"./package.json"` export),
 *    which makes them invisible to `require.resolve`
 *
 * @param packageName - The npm package name to resolve (supports scoped packages like `@scope/pkg`)
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
		// Fallback: resolve the package entry point and return its directory
		return path.dirname(
			require.resolve(packageName, {
				paths: [projectPath],
			})
		);
	} catch {}

	try {
		// Fallback: direct node_modules lookup for ESM-only packages that aren't
		// resolvable via require.resolve (e.g. packages whose exports map only has
		// an "import" condition with no "require" or "default").
		const candidate = path.join(
			projectPath,
			"node_modules",
			packageName,
			"package.json"
		);
		if (statSync(candidate).isFile()) {
			return path.dirname(candidate);
		}
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
		// The requested package may be installed under an alias (e.g. vite+
		// installs `@voidzero-dev/vite-plus-core` under the `vite` alias). In that
		// case the resolved package.json belongs to the aliased package, so its
		// `version` is not the version of the requested package.
		//
		// `bundledVersions` is NOT a standard package.json field (it is not the
		// standard `bundledDependencies`) — it is a vite+ convention that maps the
		// names of the tools it bundles to the versions it provides. When the
		// resolved package name doesn't match the requested one, prefer the version
		// declared there for the requested package.
		if (packageJson.name !== packageName) {
			const bundledVersion = packageJson.bundledVersions?.[packageName];
			if (bundledVersion !== undefined) {
				return bundledVersion;
			}
		}
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

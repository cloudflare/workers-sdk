import path from "node:path";
import * as find from "empathic/find";
import { parsePackageJSON, readFileSync } from "../parse";

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
		// Fallback: resolve the package entry point and return its directory
		return path.dirname(
			require.resolve(packageName, {
				paths: [projectPath],
			})
		);
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
 * Resolves a package version by reading its package.json from node_modules.
 *
 * This is the original resolution strategy, preserved as a fallback for
 * packages that cannot be resolved from lockfiles (aliases, binary lockfiles,
 * missing lockfiles, etc.).
 *
 * @param packageName - The name of the target package
 * @param projectPath - The path of the project to check
 * @param opts - Options
 * @param opts.stopAtProjectPath - If `true`, stop walking up at the project's path
 * @returns The installed version string, or `undefined` if the package is not installed
 */
export function getInstalledPackageVersionFromNodeModules(
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

		const packageJsonPath = find.file("package.json", {
			cwd: packagePath,
			last: opts.stopAtProjectPath === true ? projectPath : undefined,
		});

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

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
 * @returns The installed version string, or `undefined` if the package is not
 * installed or its manifest lacks a name or version
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
		const packageJson = findPackageRootManifest(packagePath, lastDir);

		if (!packageJson) {
			return undefined;
		}

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
 * Walks up from `startDir` to find and parse a package's root `package.json`.
 *
 * Dual-format packages (e.g. `hono`, `stripe`) often ship nested `package.json`
 * files such as `dist/cjs/package.json` containing only `{"type": "commonjs"}`.
 * These tell Node how to load the files in that directory but carry no `name`
 * or `version`. When the package is resolved through its entry point, the
 * nearest `package.json` may be one of these markers. Skip nameless manifests
 * and stop at the first named manifest, returning `undefined` if it has no
 * version. This also protects symlinked workspace packages resolved outside
 * `node_modules` from inheriting an ancestor's version. Stop at the installed
 * package's `node_modules` boundary if no named manifest is found.
 *
 * @param startDir - The directory to start searching from
 * @param lastDir - If provided, stop searching after reaching this directory
 * @returns The parsed root `package.json`, or `undefined` if none is found
 */
function findPackageRootManifest(
	startDir: string,
	lastDir?: string
): ReturnType<typeof parsePackageJSON> | undefined {
	let dir = startDir;

	while (true) {
		const packageJsonPath = path.join(dir, "package.json");
		if (statSync(packageJsonPath, { throwIfNoEntry: false })?.isFile()) {
			const packageJson = parsePackageJSON(
				readFileSync(packageJsonPath),
				packageJsonPath
			);
			if (packageJson.name !== undefined) {
				return packageJson.version !== undefined ? packageJson : undefined;
			}
		}

		const parent = path.dirname(dir);
		// Use the installed directory rather than the manifest's name, which may
		// be missing or differ from the requested name for npm aliases.
		if (
			dir === lastDir ||
			parent === dir ||
			path.basename(parent) === "node_modules" ||
			(path.basename(parent).startsWith("@") &&
				path.basename(path.dirname(parent)) === "node_modules")
		) {
			return undefined;
		}
		dir = parent;
	}
}

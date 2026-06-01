/**
 * Validates that packages explicitly declare their external (non-bundled) dependencies.
 *
 * This prevents accidental dependency chain poisoning where a dependency of ours
 * has not pinned its versions and allows users to install unexpected upstream
 * transitive dependencies.
 *
 * Packages should bundle their dependencies into the distributable code via
 * devDependencies. Any dependency that MUST remain external (native binaries,
 * WASM, runtime-resolved code) should be:
 * 1. Listed in `dependencies` (or `peerDependencies`) in package.json
 * 2. Listed in `scripts/deps.ts` with EXTERNAL_DEPENDENCIES export
 * 3. Documented with a comment explaining WHY it can't be bundled
 *
 * In addition to validating the manifest, this script also scans the actual
 * built/published files (from the `files` field in package.json) for bare
 * import specifiers and checks they all resolve to a declared runtime
 * dependency or peer dependency. This catches cases where a bundler config's
 * `external` list drifts from `package.json` — for example, a devDependency
 * being incorrectly externalized would leave the published bundle with an
 * unresolved import.
 */

import { existsSync, readFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, resolve } from "node:path";
import * as esbuild from "esbuild";
import { glob } from "tinyglobby";

export interface PackageJSON {
	name: string;
	private?: boolean;
	main?: string;
	module?: string;
	exports?: unknown;
	bin?: string | Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
}

export interface PackageInfo {
	dir: string;
	packageJson: PackageJSON;
}

if (require.main === module) {
	console.log("::group::Checking package dependencies");
	checkPackageDependencies()
		.then((errors) => {
			if (errors.length > 0) {
				console.error(
					"::error::Package dependency checks:" + errors.map((e) => `\n- ${e}`)
				);
			}
			console.log("::endgroup::");
			process.exit(errors.length > 0 ? 1 : 0);
		})
		.catch((error) => {
			console.log("::endgroup::");
			console.error("An unexpected error occurred", error);
			process.exit(1);
		});
}

/**
 * Gets all non-private package.json files under packages/
 */
export async function getPublicPackages(): Promise<PackageInfo[]> {
	const packagesDir = resolve(__dirname, "../../packages");
	const packageJsonPaths = await glob("*/package.json", {
		cwd: packagesDir,
		absolute: true,
	});

	return packageJsonPaths
		.map((packageJsonPath) => {
			const packageJson = JSON.parse(
				readFileSync(packageJsonPath, "utf-8")
			) as PackageJSON;
			return {
				dir: dirname(packageJsonPath),
				packageJson,
			};
		})
		.filter(({ packageJson }) => !packageJson.private);
}

/**
 * Gets all dependency names from a package.json dependencies object
 */
export function getAllDependencies(
	dependencies: Record<string, string> | undefined
): string[] {
	if (!dependencies) {
		return [];
	}
	return Object.keys(dependencies);
}

/**
 * Gets the non-workspace dependencies from a package.json
 */
export function getNonWorkspaceDependencies(
	dependencies: Record<string, string> | undefined
): string[] {
	if (!dependencies) {
		return [];
	}
	return Object.entries(dependencies)
		.filter(([, version]) => !version.startsWith("workspace:"))
		.map(([name]) => name);
}

/**
 * Attempts to load EXTERNAL_DEPENDENCIES from a package's scripts/deps.ts
 */
export function loadExternalDependencies(packageDir: string): string[] | null {
	const depsModule = loadDepsModule(packageDir);
	if (!depsModule || !Array.isArray(depsModule.EXTERNAL_DEPENDENCIES)) {
		return null;
	}
	return depsModule.EXTERNAL_DEPENDENCIES;
}

/**
 * Attempts to load IGNORED_DIST_IMPORTS from a package's scripts/deps.ts.
 *
 * `IGNORED_DIST_IMPORTS` is an allowlist of package names that the dist-scan
 * validator should not flag as missing dependencies. Use this for legitimate
 * but unfixable patterns such as:
 *   - Optional imports inside try/catch blocks in bundled libraries
 *     (e.g. `@netlify/build-info` probing for installed frameworks)
 *   - Optional native binaries (e.g. `@aws-sdk/signature-v4-crt`)
 *   - Code paths that are only reachable when consumers also install the
 *     listed package themselves
 */
export function loadIgnoredDistImports(packageDir: string): string[] {
	const depsModule = loadDepsModule(packageDir);
	if (!depsModule || !Array.isArray(depsModule.IGNORED_DIST_IMPORTS)) {
		return [];
	}
	return depsModule.IGNORED_DIST_IMPORTS;
}

function loadDepsModule(packageDir: string): {
	EXTERNAL_DEPENDENCIES?: string[];
	IGNORED_DIST_IMPORTS?: string[];
} | null {
	const depsFilePath = resolve(packageDir, "scripts/deps.ts");
	if (!existsSync(depsFilePath)) {
		return null;
	}
	// Use require with esbuild-register (which is already loaded)
	// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require needed for esbuild-register compatibility
	return require(depsFilePath) as {
		EXTERNAL_DEPENDENCIES?: string[];
		IGNORED_DIST_IMPORTS?: string[];
	};
}

/**
 * Validates a single package's dependencies against its allowlist.
 * Returns an array of error messages (empty if valid).
 */
export function validatePackageDependencies(
	packageName: string,
	relativePath: string,
	packageJson: PackageJSON,
	externalDeps: string[] | null
): string[] {
	const errors: string[] = [];

	// Get non-workspace dependencies
	const nonWorkspaceDeps = getNonWorkspaceDependencies(
		packageJson.dependencies
	);

	// Skip packages with no non-workspace dependencies
	if (nonWorkspaceDeps.length === 0) {
		return errors;
	}

	// Check if allowlist exists
	if (externalDeps === null) {
		errors.push(
			`Package "${packageName}" has ${nonWorkspaceDeps.length} non-workspace dependencies ` +
				`but no scripts/deps.ts file with EXTERNAL_DEPENDENCIES export.\n` +
				`  Create packages/${relativePath}/scripts/deps.ts with an EXTERNAL_DEPENDENCIES export ` +
				`listing all dependencies that cannot be bundled, with comments explaining why.\n` +
				`  Dependencies: ${nonWorkspaceDeps.join(", ")}`
		);
		return errors;
	}

	// Check for dependencies not in the allowlist
	const undeclaredDeps = nonWorkspaceDeps.filter(
		(dep) => !externalDeps.includes(dep)
	);

	for (const dep of undeclaredDeps) {
		errors.push(
			`Package "${packageName}" has dependency "${dep}" that is not listed in ` +
				`EXTERNAL_DEPENDENCIES (scripts/deps.ts). Either:\n` +
				`  1. Bundle this dependency by moving it to devDependencies, or\n` +
				`  2. Add it to EXTERNAL_DEPENDENCIES with a comment explaining why it can't be bundled`
		);
	}

	// Check for stale entries in the allowlist (not in dependencies or peerDependencies)
	// Note: we check against ALL dependencies here (including workspace ones) because
	// EXTERNAL_DEPENDENCIES is also used by the bundler to mark dependencies as external
	const allDeclaredDeps = [
		...getAllDependencies(packageJson.dependencies),
		...getAllDependencies(packageJson.peerDependencies),
	];

	const staleDeps = externalDeps.filter(
		(dep) => !allDeclaredDeps.includes(dep)
	);

	for (const dep of staleDeps) {
		errors.push(
			`Package "${packageName}" has "${dep}" in EXTERNAL_DEPENDENCIES but it's not in ` +
				`dependencies or peerDependencies. Remove it from scripts/deps.ts.`
		);
	}

	return errors;
}

/**
 * Given an import specifier, returns the package name part.
 *
 * Examples:
 *   "lodash" -> "lodash"
 *   "lodash/fp" -> "lodash"
 *   "@cloudflare/workers-utils" -> "@cloudflare/workers-utils"
 *   "@cloudflare/workers-utils/test-helpers" -> "@cloudflare/workers-utils"
 *   "vitest/runtime" -> "vitest"
 */
export function getPackageNameFromSpecifier(spec: string): string {
	if (spec.startsWith("@")) {
		const parts = spec.split("/");
		return parts.slice(0, 2).join("/");
	}
	return spec.split("/")[0];
}

/**
 * Returns true if the specifier refers to an external bare package import
 * (i.e. not a built-in, virtual module, or relative path).
 */
export function isBareSpecifier(spec: string): boolean {
	if (!spec || spec.startsWith(".") || spec.startsWith("/")) {
		return false;
	}
	// Node built-ins, both prefixed (node:fs) and unprefixed (fs).
	if (isBuiltin(spec)) {
		return false;
	}
	// Known non-package protocols used inside bundled user code / templates.
	// These appear inside string literals in wrangler's shipped code templates,
	// not as real imports of an npm package.
	if (/^[a-z][a-z0-9+\-.]*:/.test(spec) && !spec.startsWith("@")) {
		return false;
	}
	// Virtual / runtime-injected modules — anything in ALL_CAPS_WITH_UNDERSCORES
	// is conventionally a build-time virtual module (e.g. __VITEST_POOL_WORKERS_DEFINES).
	if (/^__[A-Z][A-Z0-9_]*$/.test(spec)) {
		return false;
	}
	// Specifier must look like a valid npm package name: lowercase letters/digits,
	// hyphens, dots, underscores; optionally scoped (@scope/name). npm package
	// names cannot contain uppercase letters per the npm naming rules.
	const packageNameRe =
		/^(?:@[a-z0-9._~-]+\/)?[a-z0-9][a-z0-9._~-]*(?:\/[a-z0-9._~-]+)*$/;
	if (!packageNameRe.test(spec)) {
		return false;
	}
	return true;
}

/**
 * Extracts all bare-specifier imports from a JS/CJS source file.
 *
 * Handles:
 *   import x from "pkg"
 *   import { x } from "pkg"
 *   import * as x from "pkg"
 *   import "pkg"
 *   export ... from "pkg"
 *   require("pkg")
 *   await import("pkg")  (only when specifier is a string literal)
 *
 * Returns top-level package names (e.g. "vitest" for "vitest/runtime").
 *
 * Uses esbuild's parser (via a `bundle: true` build with everything marked
 * external) so that specifiers found inside string literals, template
 * literals, comments, etc. are correctly ignored. `bundle: true` is required
 * to surface `require()` calls in the metafile — `bundle: false` only
 * reports ESM `import` statements. The `externalize-all` plugin short-
 * circuits resolution so esbuild never has to find the imports on disk.
 */
export async function extractBareImports(
	content: string
): Promise<Set<string>> {
	const imports = new Set<string>();

	const result = await esbuild.build({
		stdin: { contents: content, loader: "js" },
		metafile: true,
		bundle: true,
		write: false,
		logLevel: "silent",
		platform: "neutral",
		plugins: [
			{
				name: "externalize-all",
				setup(build) {
					build.onResolve({ filter: /.*/ }, (args) => {
						if (args.kind === "entry-point") {
							return undefined;
						}
						return { path: args.path, external: true };
					});
				},
			},
		],
	});

	for (const input of Object.values(result.metafile.inputs)) {
		for (const imp of input.imports) {
			if (isBareSpecifier(imp.path)) {
				imports.add(getPackageNameFromSpecifier(imp.path));
			}
		}
	}

	return imports;
}

/**
 * Collects every path string referenced by the package's main/module/exports/bin
 * fields. These are the entry points that Node.js will actually load when the
 * package is imported or executed — and thus the surface that needs to have
 * all of its imports resolvable from `dependencies`/`peerDependencies`.
 *
 * Other entries in `files` (e.g. user-facing scaffolding templates) are
 * intentionally excluded because they aren't loaded by the package itself.
 */
export function getEntryPointPaths(packageJson: PackageJSON): string[] {
	const paths = new Set<string>();
	if (packageJson.main) {
		paths.add(packageJson.main);
	}
	if (packageJson.module) {
		paths.add(packageJson.module);
	}
	walkExportValue(packageJson.exports, paths);
	if (typeof packageJson.bin === "string") {
		paths.add(packageJson.bin);
	} else if (packageJson.bin && typeof packageJson.bin === "object") {
		for (const v of Object.values(packageJson.bin)) {
			if (typeof v === "string") {
				paths.add(v);
			}
		}
	}
	return [...paths];
}

function walkExportValue(value: unknown, paths: Set<string>): void {
	if (!value) {
		return;
	}
	if (typeof value === "string") {
		paths.add(value);
		return;
	}
	if (Array.isArray(value)) {
		for (const v of value) {
			walkExportValue(v, paths);
		}
		return;
	}
	if (typeof value === "object") {
		for (const v of Object.values(value as Record<string, unknown>)) {
			walkExportValue(v, paths);
		}
	}
}

/**
 * Walks the package's runtime entry points (and any sibling files in the same
 * output directories — to cover code-split chunks) and returns the union of
 * all bare-specifier imports found across them.
 */
export async function scanDistForExternalImports(
	packageDir: string,
	packageJson: PackageJSON
): Promise<Set<string>> {
	const imports = new Set<string>();
	const entryPaths = getEntryPointPaths(packageJson);

	// Build the set of patterns to scan. For each entry-point path that points
	// at a JS file, also scan its containing directory recursively to cover
	// code-split chunks. (E.g. workers-utils' dist/index.mjs re-exports from
	// dist/chunk-*.mjs, which we want to validate too.)
	const patterns = new Set<string>();
	for (const rawPath of entryPaths) {
		const cleaned = rawPath.replace(/^\.\//, "");
		if (!/\.(mjs|cjs|js)$/.test(cleaned)) {
			continue;
		}
		const absPath = resolve(packageDir, cleaned);
		if (!existsSync(absPath)) {
			continue;
		}
		const containingDir = dirname(cleaned);
		if (containingDir && containingDir !== ".") {
			patterns.add(`${containingDir}/**/*.{mjs,cjs,js}`);
		} else {
			patterns.add(cleaned);
		}
	}

	if (patterns.size === 0) {
		return imports;
	}

	const matched = await glob([...patterns], {
		cwd: packageDir,
		absolute: true,
	});

	for (const file of matched) {
		if (file.endsWith(".map") || file.endsWith(".d.ts")) {
			continue;
		}
		const content = readFileSync(file, "utf-8");
		for (const imp of await extractBareImports(content)) {
			imports.add(imp);
		}
	}

	return imports;
}

/**
 * Validates that every bare-specifier import found in a package's published
 * files is declared as either a `dependency` or `peerDependency`.
 *
 * Catches drift between bundler config `external` lists and `package.json` —
 * for example, a devDependency that's incorrectly marked external in the
 * bundler config would leave the published bundle importing an undeclared
 * runtime dependency.
 */
export function validateDistImports(
	packageName: string,
	packageJson: PackageJSON,
	importedPackages: Set<string>,
	ignoredImports: string[] = []
): string[] {
	const errors: string[] = [];

	const declaredRuntimeDeps = new Set([
		...getAllDependencies(packageJson.dependencies),
		...getAllDependencies(packageJson.peerDependencies),
	]);
	const devDeps = new Set(getAllDependencies(packageJson.devDependencies));
	const ignored = new Set(ignoredImports);

	for (const imp of importedPackages) {
		// A package importing itself by name is always fine — it's a
		// self-reference inside the bundle (e.g. wrangler's bundled cli.js
		// contains code that references "wrangler" as a string literal).
		if (imp === packageName) {
			continue;
		}
		if (declaredRuntimeDeps.has(imp)) {
			continue;
		}
		if (ignored.has(imp)) {
			continue;
		}
		if (devDeps.has(imp)) {
			errors.push(
				`Package "${packageName}" imports "${imp}" in its published files, but ` +
					`"${imp}" is only a devDependency. Either:\n` +
					`  1. Move "${imp}" to dependencies (and add to scripts/deps.ts if appropriate), or\n` +
					`  2. Bundle "${imp}" by removing it from the bundler config's "external" list, or\n` +
					`  3. Add "${imp}" to IGNORED_DIST_IMPORTS in scripts/deps.ts if it's a legitimate optional/try-catch import.`
			);
		} else {
			errors.push(
				`Package "${packageName}" imports "${imp}" in its published files, but ` +
					`"${imp}" is not declared in dependencies or peerDependencies. ` +
					`Add it to package.json or to IGNORED_DIST_IMPORTS in scripts/deps.ts.`
			);
		}
	}

	return errors;
}

/**
 * Validates that all packages properly declare their external dependencies
 */
export async function checkPackageDependencies(): Promise<string[]> {
	const packages = await getPublicPackages();
	const errors: string[] = [];

	for (const { dir, packageJson } of packages) {
		const packageName = packageJson.name;
		const relativePath = dir.split("/packages/")[1];
		console.log(`- ${packageName}`);

		const externalDeps = loadExternalDependencies(dir);
		const packageErrors = validatePackageDependencies(
			packageName,
			relativePath,
			packageJson,
			externalDeps
		);
		errors.push(...packageErrors);

		// Scan the published runtime files (main/module/exports/bin) to catch
		// drift between bundler `external` lists and `package.json`. This
		// catches devDeps incorrectly marked as external — which would leave
		// the published bundle with unresolvable imports for end users.
		try {
			const importedPackages = await scanDistForExternalImports(
				dir,
				packageJson
			);
			const ignoredImports = loadIgnoredDistImports(dir);
			const distErrors = validateDistImports(
				packageName,
				packageJson,
				importedPackages,
				ignoredImports
			);
			errors.push(...distErrors);
		} catch (e) {
			errors.push(
				`Package "${packageName}" dist scan failed: ${e instanceof Error ? e.message : String(e)}.\n` +
					`  Make sure the package is built before running this check.`
			);
		}
	}

	return errors;
}

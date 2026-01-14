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
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { glob } from "glob";

export interface PackageJSON {
	name: string;
	private?: boolean;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
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
	const depsFilePath = resolve(packageDir, "scripts/deps.ts");

	if (!existsSync(depsFilePath)) {
		return null;
	}

	// Use require with esbuild-register (which is already loaded)
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const depsModule = require(depsFilePath) as {
		EXTERNAL_DEPENDENCIES?: string[];
	};

	if (!Array.isArray(depsModule.EXTERNAL_DEPENDENCIES)) {
		return null;
	}

	return depsModule.EXTERNAL_DEPENDENCIES;
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
	}

	return errors;
}

import path from "node:path";
import { parsePackageJSON, readFileSync } from "@cloudflare/workers-utils";
import * as find from "empathic/find";
import type { PackageJSON } from "@cloudflare/workers-utils";

type PackageJsonWithAdditionalDependencies = PackageJSON & {
	optionalDependencies?: Record<string, unknown>;
};

/**
 * Checks wether a package is installed in a target project or not
 *
 * @param packageName the name of the target package
 * @param projectPath the path of the project to check
 * @returns true if the package is installed, false otherwise
 */
export function isPackageInstalled(
	packageName: string,
	projectPath: string
): boolean {
	return !!getPackagePath(packageName, projectPath);
}

/**
 * Gets the exact version of a package installed by a project (or undefined if the package is not installed)

 * @param packageName the name of the target package
 * @param projectPath the path of the project to check
 * @param opts.stopAtProjectPath flag indicating whether the function should stop looking for the package at the project's path
 * @returns the version of the package if the package is installed, undefined otherwise
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
		if (opts.stopAtProjectPath === true) {
			const relativePackagePath = path.relative(projectPath, packagePath);
			if (
				relativePackagePath.startsWith("..") ||
				path.isAbsolute(relativePackagePath)
			) {
				return undefined;
			}
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
		return packageJson.version;
	} catch {}
}

export function getPackageJsonDependencyVersion(
	packageName: string,
	projectPath: string
): string | undefined {
	const packageJson = getPackageJson(projectPath);
	if (!packageJson) {
		return undefined;
	}

	return getVersionFromSpecifier(
		getPackageJsonDependency(packageJson, packageName)
	);
}

export function hasPackageJsonDependency(
	packageName: string,
	projectPath: string
): boolean {
	const packageJson = getPackageJson(projectPath);
	if (!packageJson) {
		return false;
	}

	return getPackageJsonDependency(packageJson, packageName) !== undefined;
}

function getPackageJson(
	projectPath: string
): PackageJsonWithAdditionalDependencies | undefined {
	const packageJsonPath = path.join(projectPath, "package.json");

	try {
		return parsePackageJSON(
			readFileSync(packageJsonPath),
			packageJsonPath
		) as PackageJsonWithAdditionalDependencies;
	} catch {
		return undefined;
	}
}

function getPackageJsonDependency(
	packageJson: PackageJsonWithAdditionalDependencies,
	packageName: string
): unknown {
	return (
		packageJson.dependencies?.[packageName] ??
		packageJson.devDependencies?.[packageName] ??
		packageJson.optionalDependencies?.[packageName]
	);
}

function getVersionFromSpecifier(
	versionSpecifier: unknown
): string | undefined {
	if (typeof versionSpecifier !== "string") {
		return undefined;
	}

	const versionMatch = versionSpecifier.match(
		/(\d+)(?:\.(\d+))?(?:\.(\d+))?(-[0-9A-Za-z.-]+)?/
	);

	if (!versionMatch) {
		return undefined;
	}

	const [, major, minor = "0", patch = "0", prerelease = ""] = versionMatch;
	return `${major}.${minor}.${patch}${prerelease}`;
}

/**
 * Gets the path for a package installed by a project (or undefined if the package is not installed)
 *
 * @param packageName the name of the target package
 * @param projectPath the path of the project
 * @returns the path for the package if the package is installed, undefined otherwise
 */
function getPackagePath(
	packageName: string,
	projectPath: string
): string | undefined {
	try {
		// Note: we first try to `require.resolve` using the package.json this will succeed
		//       if the package.json is exported by the package
		return path.dirname(
			require.resolve(`${packageName}/package.json`, {
				paths: [projectPath],
			})
		);
	} catch {}

	try {
		// Note: if `require.resolve` using the package.json failed (the package.json is not
		//       exported by the package) then let's try to `require.resolve` on the package
		//       name directly
		return require.resolve(packageName, {
			paths: [projectPath],
		});
	} catch {}

	return undefined;
}

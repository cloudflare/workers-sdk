import path from "node:path";
import { parsePackageJSON, readFileSync } from "@cloudflare/workers-utils";
import * as find from "empathic/find";

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

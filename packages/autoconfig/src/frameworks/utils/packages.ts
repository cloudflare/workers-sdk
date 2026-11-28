import { join } from "node:path";
import { parsePackageJSON, readFileSync } from "@cloudflare/workers-utils";
import type { PackageJSON } from "@cloudflare/workers-utils";

export {
	isPackageInstalled,
	getInstalledPackageVersion,
} from "@cloudflare/workers-utils";

/**
 * Reads a project's `package.json`.
 *
 * @param projectPath The project's path
 * @returns The project's `package.json`, or undefined if it has none
 */
export function readPackageJson(projectPath: string): PackageJSON | undefined {
	const path = join(projectPath, "package.json");
	try {
		return parsePackageJSON(readFileSync(path), path);
	} catch {
		return undefined;
	}
}

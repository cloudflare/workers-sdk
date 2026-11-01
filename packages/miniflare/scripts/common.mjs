import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const pkgRoot = path.resolve(__dirname, "..");

/**
 * @typedef {object} ~Package
 * @property {string} name
 * @property {string} version
 * @property {Record<string, string>} [dependencies]
 * @property {Record<string, string>} [devDependencies]
 * @property {Record<string, string>} [peerDependencies]
 * @property {Record<string, string>} [optionalDependencies]
 * @property {string[]} [entryPoints]
 */

/**
 * Gets the contents of the package.json file in <pkgRoot>
 * @param {string} pkgRoot
 * @returns {~Package}
 */
export function getPackage(pkgRoot) {
	return JSON.parse(
		fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8")
	);
}

import { execSync } from "node:child_process";
import {
	getPackagesForPrerelease,
	getPrereleaseArtifactUrl,
	setPackage,
} from "./0-packages.mjs";

function getPrereleaseVersion() {
	const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" });
	return `0.0.0-${sha.trim()}`;
}

/**
 * @param {~Package[]} pkgs
 * @param {string} newVersion
 */
function updateVersions(pkgs, newVersion) {
	for (const pkg of pkgs) pkg.json.version = newVersion;
}

/**
 * @param {~Package[]} pkgs
 * @param {string} newVersion
 */
function updateDependencyVersions(pkgs, newVersion) {
	const prereleaseNames = new Set(pkgs.map((pkg) => pkg.json.name));
	for (const pkg of pkgs) {
		for (const dependency of Object.keys(pkg.json.dependencies ?? {})) {
			if (prereleaseNames.has(dependency)) {
				pkg.json.dependencies[dependency] =
					getPrereleaseArtifactUrl(dependency);
			}
		}
	}
}

{
	const pkgs = getPackagesForPrerelease();
	const newVersion = getPrereleaseVersion();
	updateVersions(pkgs, newVersion);
	updateDependencyVersions(pkgs, newVersion);
	for (const pkg of pkgs) setPackage(pkg);
}

import { execSync } from "node:child_process";
import { getPackagesForPrerelease, setPackage } from "./0-packages.mjs";

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

{
	const pkgs = getPackagesForPrerelease();
	const newVersion = getPrereleaseVersion();
	updateVersions(pkgs, newVersion);
	// Ideally, we'd update dependency versions here too, but Turborepo doesn't
	// respect `https://` version constraints for building dependent packages
	// first.
	pkgs.forEach(setPackage);
}

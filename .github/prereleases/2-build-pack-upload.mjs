import assert from "node:assert";
import { execSync } from "node:child_process";
import path from "node:path";
import { DefaultArtifactClient } from "@actions/artifact";
import {
	getPackagesForPrerelease,
	getPrereleaseArtifactName,
	projectRoot,
} from "./0-packages.mjs";

const artifact = new DefaultArtifactClient();

function buildAllPackages() {
	execSync("pnpm build", { cwd: projectRoot, stdio: "inherit" });
}

/**
 * @param {~Package} pkg
 * @returns {string}
 */
function packPackage(pkg) {
	const stdout = execSync("pnpm pack", { cwd: pkg.path, encoding: "utf8" });
	const name = stdout.split("\n").find((line) => line.endsWith(".tgz"));
	assert(name !== undefined, `Expected ${stdout} to include tarball name`);
	return path.join(pkg.path, name);
}

/**
 * @param {~Package} pkg
 * @param {string} tarballPath
 */
async function uploadPackageTarball(pkg, tarballPath) {
	const name = getPrereleaseArtifactName(pkg.json.name);
	console.log(`Uploading ${tarballPath} as ${name}...`);
	await artifact.uploadArtifact(name, [tarballPath], pkg.path);
}

{
	buildAllPackages();
	const pkgs = getPackagesForPrerelease();
	for (const pkg of pkgs) {
		const tarballPath = packPackage(pkg);
		await uploadPackageTarball(pkg, tarballPath);
	}
}

import assert from "node:assert";
import { execSync } from "node:child_process";
import path from "node:path";
import { DefaultArtifactClient } from "@actions/artifact";
import {
	getPackagesForPrerelease,
	getPrereleaseArtifactName,
	getPrereleaseArtifactUrl,
	projectRoot,
	setPackage,
} from "./0-packages.mjs";

const artifact = new DefaultArtifactClient();

function buildAllPackages() {
	execSync("pnpm build", { cwd: projectRoot, stdio: "inherit" });
}

/** @param {~Package[]} pkgs */
function updateDependencyVersions(pkgs) {
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
 * @param {string} artifactPath
 */
async function uploadPackageArtifact(pkg, artifactPath) {
	const name = getPrereleaseArtifactName(pkg.json.name);
	console.log(`Uploading ${artifactPath} as ${name}...`);
	await artifact.uploadArtifact(name, [artifactPath], pkg.path);
}

{
	buildAllPackages();
	const pkgs = getPackagesForPrerelease();

	// Update dependency versions *after* the build, so Turborepo knows to build
	// dependent packages first
	updateDependencyVersions(pkgs);
	pkgs.forEach(setPackage);

	for (const pkg of pkgs) {
		if (pkg.json["workers-sdk"].type === "extension") {
			const path = path.join(
				pkg.path,
				`${pkg.json.name}-${pkg.json.version}.vsix`
			);
			await uploadPackageArtifact(pkg, path);
		} else {
			const tarballPath = packPackage(pkg);
			await uploadPackageArtifact(pkg, tarballPath);
		}
	}
}

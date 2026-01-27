import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

if (require.main === module) {
	if (process.argv[2] === "check") {
		findDeployablePackageNames();
	} else {
		deployNonNpmPackages(getUpdatedPackages(), findDeployablePackageNames());
	}
}

/**
 * Deploy all packages that had updates but are not deployed to npm automatically by the changesets tooling.
 *
 * @param updatedPackages An array of all the packages that were updated by changesets.
 * @param deployablePackageNames A set of the names of packages that can be deployed by this script.
 */
export function deployNonNpmPackages(
	updatedPackages: UpdatedPackage[],
	deployablePackageNames: Set<string>
) {
	let deployedPackageCount = 0;
	console.log("Checking for non-npm packages to deploy...");
	const deploymentErrors = new Map<string, string>();
	for (const pkg of updatedPackages) {
		if (deployablePackageNames.has(pkg.name)) {
			console.log(`Package "${pkg.name}@${pkg.version}": deploying...`);
			deployPackage(pkg.name, deploymentErrors);
			deployedPackageCount++;
		} else {
			console.log(
				`Package "${pkg.name}@${pkg.version}": already deployed via npm.`
			);
		}
	}
	if (deployedPackageCount === 0) {
		console.log("No non-npm packages to deploy.");
	} else {
		console.log(`Deployed ${deployedPackageCount} non-npm packages.`);
	}
	writeFileSync(
		"deployment-status.json",
		JSON.stringify(Object.fromEntries(deploymentErrors.entries()))
	);
}

/**
 * Get a list of all the packages that got bumped by changesets from the PUBLISHED_PACKAGES environment variable.
 */
export function getUpdatedPackages(): UpdatedPackage[] {
	const packages = JSON.parse(process.env.PUBLISHED_PACKAGES ?? "[]");

	assert(
		Array.isArray(packages),
		`Expected PUBLISHED_PACKAGES to be an array but got ${typeof packages}.`
	);
	packages.forEach((p, i) => {
		assert(
			typeof p === "object" && p !== null,
			`Expected item ${i} in array to be an array but got ${typeof p}.`
		);
		assert(
			typeof p.name === "string",
			`Expected item ${i} to have a "name" property of type string but got ${p.name}.`
		);
		assert(
			typeof p.version === "string",
			`Expected item ${i} to have a "version" property of type string but got ${p.version}.`
		);
	});

	return packages;
}

/**
 * Look for all the packages (under the top-level "packages" directory of the monorepo)
 * that can be deployed using this script.
 *
 * This is determined by the package containing a package.json "workers-sdk": { "deploy": true }`
 */
export function findDeployablePackageNames(): Set<string> {
	const packagesDirectory = resolve(__dirname, "../../packages");
	const allPackageDirectories = readdirSync(packagesDirectory).map((p) =>
		resolve(packagesDirectory, p)
	);
	const allPackages: PackageJSON[] = [];
	for (const dir of allPackageDirectories) {
		try {
			allPackages.push(
				JSON.parse(readFileSync(resolve(dir, "package.json"), "utf-8"))
			);
		} catch {
			// Do nothing
		}
	}
	const deployablePackages = new Set<string>();
	for (const pkg of allPackages) {
		if (pkg["workers-sdk"]?.deploy) {
			assert(
				pkg.scripts?.deploy !== undefined,
				`Expected package "${pkg.name}" to have a deploy script`
			);
			deployablePackages.add(pkg.name);
		}
	}
	return deployablePackages;
}

/**
 * Try to run `pnpm deploy` on the given package in the monorepo.
 *
 * If this deployment fails, log an error and continue.
 *
 * @param pkgName the package to deploy
 */
export function deployPackage(
	pkgName: string,
	deploymentErrors: Map<string, string>
) {
	try {
		spawnSync(`pnpm`, [`-F`, pkgName, `run`, `deploy`], {
			env: process.env,
			stdio: "inherit",
		});
	} catch (e) {
		console.error(`::error::Failed to deploy "${pkgName}".`);
		console.error(
			"Work out why this happened and then potentially run a manual deployment."
		);
		console.error(e);
		deploymentErrors.set(pkgName, String(e));
	}
}

export type UpdatedPackage = { name: string; version: string };

export type PackageJSON = {
	name: string;
	private?: boolean;
	scripts?: Record<string, unknown>;
	"workers-sdk"?: {
		deploy?: boolean;
	};
};

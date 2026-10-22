import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import getReleasePlan from "@changesets/get-release-plan";
import parseChangeset from "@changesets/parse";

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}

async function main() {
	const packages = findPackages();
	const changesets = readChangesets(resolve(__dirname, "../../.changeset"));
	const errors = validateChangesets(packages, changesets);
	// Invalid changesets cannot be assembled into a release plan.
	if (errors.length === 0) {
		const { releases } = await getReleasePlan(resolve(__dirname, "../.."));
		errors.push(...validateDevDependencyReleases(packages, releases));
	}
	if (errors.length > 0) {
		console.error("Validation errors in changesets:");
		for (const error of errors) {
			console.error("- ", error);
		}
		process.exit(1);
	}
}

/**
 * Check that public consumers of released workspace devDependencies are also
 * released. Changesets schedules runtime dependants automatically, but only
 * updates dependency ranges for devDependencies without bumping their consumers.
 *
 * @param packages - Packages eligible for changesets.
 * @param releases - Changesets' complete release plan, including automatic bumps.
 * @returns Errors identifying consumers that still need a changeset.
 */
export function validateDevDependencyReleases(
	packages: ReadonlyMap<string, PackageJSON>,
	releases: readonly { name: string; type: string }[]
): string[] {
	const releasingPackages = new Set(
		releases.filter(({ type }) => type !== "none").map(({ name }) => name)
	);
	const errors: string[] = [];
	for (const pkg of packages.values()) {
		if (pkg.private || releasingPackages.has(pkg.name)) {
			continue;
		}
		const releasedDependencies = Object.entries(pkg.devDependencies ?? {})
			.filter(
				([name, range]) =>
					range.startsWith("workspace:") && releasingPackages.has(name)
			)
			.map(([name]) => `"${name}"`)
			.sort();
		if (releasedDependencies.length > 0) {
			errors.push(
				`Package "${pkg.name}" must be released because it has released workspace devDependencies: ${releasedDependencies.join(", ")}. Add a patch (or higher) changeset entry for "${pkg.name}".`
			);
		}
	}
	return errors;
}

export function validateChangesets(
	packages: Map<string, PackageJSON>,
	changesets: ChangesetFile[]
) {
	const errors: string[] = [];
	for (const pkg of packages.values()) {
		const config = pkg["workers-sdk"]?.npmPrerelease;
		if (config === undefined) {
			continue;
		}
		if (
			typeof config !== "object" ||
			config === null ||
			Array.isArray(config)
		) {
			errors.push(
				`Invalid workers-sdk.npmPrerelease config for package "${pkg.name}".`
			);
			continue;
		}
		if (
			typeof config.tag !== "string" ||
			config.tag === "latest" ||
			!/^[A-Za-z][0-9A-Za-z-]*$/.test(config.tag)
		) {
			errors.push(`Invalid npmPrerelease tag for package "${pkg.name}".`);
		}
		if (typeof config.numbered !== "boolean") {
			errors.push(
				`Invalid npmPrerelease numbered value for package "${pkg.name}".`
			);
		}
	}
	changesets.map(({ file, contents }) => {
		try {
			const changeset = parseChangeset(contents);
			for (const release of changeset.releases) {
				const targetPackage = packages.get(release.name);
				if (!targetPackage) {
					errors.push(
						`Unknown package name "${release.name}" in changeset at "${file}".`
					);
				}

				if (
					release.type === "major" &&
					targetPackage?.private !== true &&
					// `@cloudflare/vitest-plugin` v1 is the rename of
					// `@cloudflare/vitest-pool-workers`, which needs a one-off major bump.
					release.name !== "@cloudflare/vitest-plugin" &&
					targetPackage?.["workers-sdk"]?.npmPrerelease === undefined
				) {
					errors.push(
						`Major version bumps are not allowed for package "${release.name}" in changeset at "${file}".`
					);
				}
				if (!["major", "minor", "patch", "none"].includes(release.type)) {
					errors.push(
						`Invalid type "${release.type}" for package "${release.name}" in changeset at "${file}".`
					);
				}
			}
		} catch (e) {
			if (e instanceof Error) {
				errors.push(e.toString() + `at file "${file}"`);
			} else {
				throw e;
			}
		}
	});
	return errors;
}

export function readChangesets(changesetDir: string): ChangesetFile[] {
	return readdirSync(changesetDir)
		.filter(
			(file) =>
				!file.startsWith(".") && file.endsWith(".md") && file !== "README.md"
		)
		.map((file) => ({
			file,
			contents: readFileSync(resolve(changesetDir, file), "utf-8"),
		}));
}

/**
 * Look for all the packages (under the top-level "packages" directory of the monorepo) that can have changesets.
 *
 * This is determined by the package containing a package.json that is public or
 * is marked as `"private": true` and has a `deploy` script.
 */
export function findPackages(): Map<string, PackageJSON> {
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
	const deployablePackages = new Map<string, PackageJSON>();
	for (const pkg of allPackages) {
		if (!pkg.private || pkg.scripts?.deploy !== undefined) {
			deployablePackages.set(pkg.name, pkg);
		}
	}
	return deployablePackages;
}

export type ChangesetFile = {
	file: string;
	contents: string;
};

export type PackageJSON = {
	name: string;
	private?: boolean;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	scripts?: Record<string, unknown>;
	"workers-sdk"?: {
		deploy?: boolean;
		prerelease?: boolean;
		npmPrerelease?: {
			tag?: unknown;
			numbered?: unknown;
		};
	};
};

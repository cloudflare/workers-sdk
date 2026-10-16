import assert from "node:assert";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { SemVer } from "semver";

// This script is used by the `changesets.yml` workflow to update the version of the packages being released.
// The standard step is only to run `changeset version` but this does not update the lockfile.
// So we also run `pnpm install`, which does this update.
// This is a workaround until this is handled automatically by `changeset version`.
// See https://github.com/changesets/changesets/issues/421.

const DEPENDENCY_FIELDS = [
	"dependencies",
	"devDependencies",
	"peerDependencies",
	"optionalDependencies",
] as const;

interface NpmPrereleaseConfig {
	tag: string;
	numbered: boolean;
	numberPrefix?: "v";
}

interface PackageJSON {
	name: string;
	version: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	"workers-sdk"?: {
		npmPrerelease?: unknown;
	};
}

interface NpmPrereleaseVersionOptions {
	previousVersion: string;
	versionAfterChangesets: string;
	config: NpmPrereleaseConfig;
	normalizeVersion?: (candidate: string) => string;
}

interface MiniflarePrereleaseVersionOptions {
	workerdVersion: string;
	previousVersion: string;
	versionAfterChangesets: string;
	config: NpmPrereleaseConfig;
}

interface PreviousPackage {
	name: string;
	pkgPath: string;
	previousVersion: string;
	config: NpmPrereleaseConfig | undefined;
}

interface CorrectVersionReferencesOptions {
	packageName: string;
	packagePath: string;
	versionAfterChangesets: string;
	nextVersion: string;
}

function getPkg(filePath: string): PackageJSON {
	return JSON.parse(readFileSync(filePath, "utf8")) as PackageJSON;
}

function setPkg(filePath: string, newPkg: PackageJSON): void {
	writeFileSync(filePath, `${JSON.stringify(newPkg, null, "\t")}\n`);
}

const rootPath = resolve(__dirname, "../..");
const packagesPath = join(rootPath, "packages");

export function getNpmPrereleaseConfig(
	pkg: PackageJSON
): NpmPrereleaseConfig | undefined {
	const config = pkg["workers-sdk"]?.npmPrerelease;
	if (config === undefined) {
		return undefined;
	}
	assert(
		typeof config === "object" && config !== null && !Array.isArray(config),
		`Invalid ${pkg.name} workers-sdk.npmPrerelease config`
	);
	const { tag, numbered } = config as Record<string, unknown>;
	assert(
		typeof tag === "string" &&
			tag !== "latest" &&
			/^[A-Za-z][0-9A-Za-z-]*$/.test(tag),
		`Invalid ${pkg.name} npmPrerelease tag`
	);
	assert(
		typeof numbered === "boolean",
		`Invalid ${pkg.name} npmPrerelease numbered value`
	);
	// Vite plugin v2 betas were previously published as `2.0.0-beta.sha-*`.
	// Temporarily start its Changesets releases at `2.0.0-beta.v.0`; `v` sorts
	// after `sha-*`. Remove this special case once v2 is stable.
	const numberPrefix =
		pkg.name === "@cloudflare/vite-plugin" && tag === "beta" && numbered
			? "v"
			: undefined;
	return {
		tag,
		numbered,
		...(numberPrefix === undefined ? {} : { numberPrefix }),
	};
}

function appendPrerelease(
	coreVersion: string,
	config: NpmPrereleaseConfig,
	number: number
): string {
	const prefix =
		config.numberPrefix === undefined ? "" : `.${config.numberPrefix}`;
	const suffix = config.numbered ? `${prefix}.${number}` : "";
	return `${coreVersion}-${config.tag}${suffix}`;
}

/**
 * Converts the version proposed by Changesets into the package's configured
 * prerelease sequence. Changesets decides whether a package should be released,
 * but it does not preserve either of the prerelease policies we support:
 *
 * - Numbered prereleases keep their original core version and increment the
 *   suffix: `2.0.0-beta.0` -> `2.0.0-beta.1`. Vite plugin v2 temporarily uses
 *   `2.0.0-beta.v.0` -> `2.0.0-beta.v.1` instead.
 * - Unnumbered prereleases increment the patch instead:
 *   `5.20261006.1-beta` -> `5.20261006.2-beta`.
 *
 * Entering either sequence requires a major changeset.
 * `versionAfterChangesets` is the result of `changeset version`. Once a
 * prerelease is active, it is used to detect a release, but its core version is
 * not authoritative.
 */
export function getNextNpmPrereleaseVersion({
	previousVersion,
	versionAfterChangesets,
	config,
	normalizeVersion = (candidate) => candidate,
}: NpmPrereleaseVersionOptions): string {
	const previous = new SemVer(previousVersion);
	const previousCoreVersion = `${previous.major}.${previous.minor}.${previous.patch}`;

	if (previous.prerelease.length === 0) {
		// Configuration alone must not put an unchanged stable package into
		// prerelease. `normalizeVersion()` may still align Miniflare with workerd.
		const nextVersion = normalizeVersion(versionAfterChangesets);
		if (previousVersion === versionAfterChangesets) {
			return nextVersion;
		}

		// When entering prerelease, a major changeset chooses the new stable core.
		const { major } = new SemVer(versionAfterChangesets);
		assert(
			major > previous.major,
			"Starting a prerelease requires a major bump"
		);
		return appendPrerelease(nextVersion, config, 0);
	}

	// During an active numbered prerelease, all changeset types advance the
	// suffix while keeping the intended stable core. During an unnumbered
	// prerelease, all changeset types advance the patch instead.
	let nextCoreVersion = previousCoreVersion;
	if (previousVersion !== versionAfterChangesets && !config.numbered) {
		nextCoreVersion = `${previous.major}.${previous.minor}.${previous.patch + 1}`;
	}
	nextCoreVersion = normalizeVersion(nextCoreVersion);

	// Continue an existing numbered sequence when possible. A tag or core change
	// starts a new sequence at zero.
	let number = 0;
	const previousNumber = previous.prerelease.at(-1);
	if (
		config.numbered &&
		previous.prerelease[0] === config.tag &&
		typeof previousNumber === "number" &&
		nextCoreVersion === previousCoreVersion
	) {
		number = previousNumber;
		if (previousVersion !== versionAfterChangesets) {
			number++;
		}
	}

	return appendPrerelease(nextCoreVersion, config, number);
}

function getWorkerdVersion(): string {
	const pnpmWorkspacePath = join(rootPath, "pnpm-workspace.yaml");
	const match = /workerd: "(\d+\.\d+\.\d+)"/.exec(
		readFileSync(pnpmWorkspacePath, "utf8")
	);
	assert(match !== null, "Expected workerd to be <major>.<minor>.<patch>");
	return match[1];
}

/**
 * Gets the correct version to bump `miniflare` to, ensuring the minor versions
 * of `workerd` and `miniflare` match. Minor bumps in changesets will become
 * patch bumps if the `workerd` version hasn't changed.
 * See `changeset-version.test.ts` for examples.
 *
 * @param workerdVersion `workerd` version constraint in `miniflare` package
 * @param previousVersion `miniflare` version before running `changeset version`
 * @param versionAfterChangesets `miniflare` version after running `changeset version`
 */
export function getNextMiniflareVersion(
	workerdVersion: string,
	previousVersion: string,
	versionAfterChangesets: string
): string {
	const workerd = new SemVer(workerdVersion);
	const previous = new SemVer(previousVersion);
	const next = new SemVer(versionAfterChangesets);
	if (workerd.minor === next.minor) {
		// If the minor versions match already, there's nothing we need to do
		return versionAfterChangesets;
	} else if (workerd.minor > next.minor) {
		// If the workerd minor is greater than the miniflare minor,
		// use the workerd minor and reset patch to 0
		return `${next.major}.${workerd.minor}.0`;
	} else {
		// Otherwise, if the workerd minor is less than the miniflare minor,
		// use the workerd minor and bump the patch instead
		return `${next.major}.${workerd.minor}.${previous.patch + 1}`;
	}
}

/** Applies Miniflare's workerd alignment on top of the generic npm policy. */
export function getNextMiniflarePrereleaseVersion({
	workerdVersion,
	previousVersion,
	versionAfterChangesets,
	config,
}: MiniflarePrereleaseVersionOptions): string {
	return getNextNpmPrereleaseVersion({
		previousVersion,
		versionAfterChangesets,
		config,
		normalizeVersion: (candidate) =>
			getNextMiniflareVersion(workerdVersion, previousVersion, candidate),
	});
}

function getPackagesBeforeVersioning(): PreviousPackage[] {
	// The original version is required after Changesets runs so we can distinguish
	// a real release from an unchanged package and continue an existing sequence.
	const packages: PreviousPackage[] = [];
	for (const entry of readdirSync(packagesPath)) {
		const pkgPath = join(packagesPath, entry, "package.json");
		let pkg: PackageJSON;
		try {
			pkg = getPkg(pkgPath);
		} catch {
			continue;
		}
		const config = getNpmPrereleaseConfig(pkg);
		if (pkg.name === "miniflare" || config !== undefined) {
			packages.push({
				name: pkg.name,
				pkgPath,
				previousVersion: pkg.version,
				config,
			});
		}
	}
	return packages;
}

export function correctVersionReferences({
	packageName,
	packagePath,
	versionAfterChangesets,
	nextVersion,
}: CorrectVersionReferencesOptions): void {
	// Changesets has already updated the affected manifests and changelogs. Limit
	// corrections to those files instead of scanning and rewriting the workspace.
	const changedPathsBuffer = execSync("git ls-files --modified", {
		cwd: rootPath,
	});
	console.log("Checking modified files...");
	const changedPaths = changedPathsBuffer.toString().trim().split("\n");
	for (const relativeChangedPath of changedPaths) {
		const changedPath = resolve(rootPath, relativeChangedPath);
		const name = basename(changedPath);
		if (name === "package.json") {
			console.log("Updating dependencies in", changedPath);
			const pkg = getPkg(changedPath);
			let changed = false;
			for (const key of DEPENDENCY_FIELDS) {
				const dependencies = pkg[key];
				if (dependencies === undefined) {
					continue;
				}
				const constraint = dependencies[packageName];
				if (constraint === undefined) {
					continue;
				}
				// Workspace ranges resolve from the target manifest at publish time;
				// npm aliases intentionally use a published version outside the workspace.
				// Neither needs the version correction applied by this script.
				if (
					constraint.startsWith("workspace:") ||
					constraint.startsWith("npm:")
				) {
					continue;
				}
				dependencies[packageName] = nextVersion;
				changed = true;
			}
			if (changed) {
				setPkg(changedPath, pkg);
			}
		} else if (name === "CHANGELOG.md") {
			console.log("Updating changelog in", changedPath);
			let changelog = readFileSync(changedPath, "utf8");
			if (changedPath === join(dirname(packagePath), "CHANGELOG.md")) {
				changelog = changelog.replace(
					`## ${versionAfterChangesets}`,
					`## ${nextVersion}`
				);
			}
			changelog = changelog.replace(
				`- ${packageName}@${versionAfterChangesets}`,
				`- ${packageName}@${nextVersion}`
			);
			writeFileSync(changedPath, changelog);
		}
	}
}

function main(): void {
	// Get package versions before applying changesets, so custom versioning
	// can distinguish a new release from an unchanged package.
	const previousPackages = getPackagesBeforeVersioning();

	// Run standard `changeset version` command to apply changesets, bump
	// versions, and update changelogs
	console.log("Applying changesets and updating versions...");
	execSync("pnpm exec changeset version", { stdio: "inherit" });

	// Apply npm prerelease policies and keep Miniflare aligned with workerd.
	console.log("Applying custom package versions...");
	const workerdVersion = getWorkerdVersion();
	for (const previousPackage of previousPackages) {
		const pkg = getPkg(previousPackage.pkgPath);
		const versionAfterChangesets = pkg.version;
		let nextVersion = versionAfterChangesets;
		if (previousPackage.config !== undefined) {
			nextVersion =
				previousPackage.name === "miniflare"
					? getNextMiniflarePrereleaseVersion({
							workerdVersion,
							previousVersion: previousPackage.previousVersion,
							versionAfterChangesets,
							config: previousPackage.config,
						})
					: getNextNpmPrereleaseVersion({
							previousVersion: previousPackage.previousVersion,
							versionAfterChangesets,
							config: previousPackage.config,
						});
		} else if (previousPackage.name === "miniflare") {
			nextVersion = getNextMiniflareVersion(
				workerdVersion,
				previousPackage.previousVersion,
				versionAfterChangesets
			);
		}

		if (nextVersion === versionAfterChangesets) {
			continue;
		}
		console.log(
			`Updating ${previousPackage.name} version to ${nextVersion}...`
		);
		pkg.version = nextVersion;
		setPkg(previousPackage.pkgPath, pkg);
		correctVersionReferences({
			packageName: previousPackage.name,
			packagePath: previousPackage.pkgPath,
			versionAfterChangesets,
			nextVersion,
		});
	}

	// Update the lockfile
	// TODO: Check whether this is still necessary now that pnpm v10 lockfiles no
	// longer record workspace package versions.
	// https://github.com/changesets/changesets/issues/421#issuecomment-3546221416
	console.log("Updating lockfile...");
	execSync("pnpm install --lockfile-only", { stdio: "inherit" });
	console.log("Done.");
}

if (require.main === module) {
	main();
}

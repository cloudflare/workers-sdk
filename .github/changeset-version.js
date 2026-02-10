const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

// This script is used by the `release.yml` workflow to update the version of the packages being released.
// The standard step is only to run `changeset version` but this does not update the lockfile.
// So we also run `pnpm install`, which does this update.
// This is a workaround until this is handled automatically by `changeset version`.
// See https://github.com/changesets/changesets/issues/421.

function getPkg(filePath) {
	return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
function setPkg(filePath, newPkg) {
	fs.writeFileSync(filePath, `${JSON.stringify(newPkg, null, "\t")}\n`);
}
function parseVersion(version) {
	// Extract `<major>.<minor>.<patch>` from version (could be a constraint)
	const match = /(\d+)\.(\d+)\.(\d+)/.exec(version);
	assert(match !== null, `Expected ${version} to be <major>.<minor>.<patch>`);
	return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
}

const rootPath = path.resolve(__dirname, "..");
const miniflarePath = path.join(rootPath, "packages/miniflare");
const miniflarePkgPath = path.join(miniflarePath, "package.json");

function getWorkerdVersion() {
	const pnpmWorkspacePath = path.join(rootPath, "pnpm-workspace.yaml");
	const match = /workerd: "(\d+\.\d+\.\d+)"/.exec(
		fs.readFileSync(pnpmWorkspacePath, "utf8")
	);
	assert(match !== null, `Expected ${match[1]} to be <major>.<minor>.<patch>`);
	return match[1];
}
/**
 * Gets the correct version to bump `miniflare` to, ensuring the minor versions
 * of `workerd` and `miniflare` match. Minor bumps in changesets will become
 * patch bumps if the `workerd` version hasn't changed.
 * See `changeset-version.test.js` for examples.
 *
 * @param workerdVersion `workerd` version constraint in `miniflare` package
 * @param previousVersion `miniflare` version before running `changeset version`
 * @param version `miniflare` version after running `changeset version`
 */
function getNextMiniflareVersion(workerdVersion, previousVersion, version) {
	const [, workerdMinor] = parseVersion(workerdVersion);
	const [, , previousPatch] = parseVersion(previousVersion);
	const [major, minor] = parseVersion(version);
	if (workerdMinor === minor) {
		// If the minor versions match already, there's nothing we need to do
		return version;
	} else if (workerdMinor > minor) {
		// If the workerd minor is greater than the miniflare minor,
		// use the workerd minor and reset patch to 0
		return `${major}.${workerdMinor}.0`;
	} else {
		// Otherwise, if the workerd minor is less than the miniflare minor,
		// use the workerd minor and bump the patch instead
		return `${major}.${workerdMinor}.${previousPatch + 1}`;
	}
}
exports.getNextMiniflareVersion = getNextMiniflareVersion;

function main() {
	// 1. Get `miniflare` version before applying changesets, so we know if the
	//    minor version was bumped
	const previousMiniflarePkg = getPkg(miniflarePkgPath);
	const previousMiniflareVersion = previousMiniflarePkg.version;

	// 2. Run standard `changeset version` command to apply changesets, bump
	//    versions, and update changelogs
	console.log("Applying changesets and updating versions...");
	execSync("pnpm exec changeset version", { stdio: "inherit" });

	// 3. Force `miniflare`'s minor version to be the same as `workerd`
	console.log("Getting miniflare and workerd versions...");
	const miniflarePkg = getPkg(miniflarePkgPath);
	const miniflareVersion = miniflarePkg.version;
	const workerdVersion = getWorkerdVersion();
	const nextMiniflareVersion = getNextMiniflareVersion(
		workerdVersion,
		previousMiniflareVersion,
		miniflareVersion
	);
	if (nextMiniflareVersion !== miniflareVersion) {
		// If `changeset version` didn't produce the correct version on its own...

		// ...update `miniflare`'s `package.json` version
		console.log(`Updating miniflare version to ${nextMiniflareVersion}...`);
		miniflarePkg.version = nextMiniflareVersion;
		setPkg(miniflarePkgPath, miniflarePkg);

		const changedPathsBuffer = execSync("git ls-files --modified", {
			cwd: rootPath,
		});
		console.log("Checking modified files...");
		const changedPaths = changedPathsBuffer.toString().trim().split("\n");
		for (const relativeChangedPath of changedPaths) {
			const changedPath = path.resolve(rootPath, relativeChangedPath);
			const name = path.basename(changedPath);
			if (name === "package.json") {
				console.log("Updating dependencies in", changedPath);
				// ...update `miniflare` version in dependencies of other packages
				const pkg = getPkg(changedPath);
				let changed = false;
				for (const key of [
					"dependencies",
					"devDependencies",
					"peerDependencies",
					"optionalDependencies",
				]) {
					const constraint = pkg[key]?.["miniflare"];
					if (constraint === undefined) continue;
					// Don't update `workspace:`-style constraints
					if (constraint.startsWith("workspace:")) continue;
					pkg[key]["miniflare"] = nextMiniflareVersion;
					changed = true;
				}
				if (changed) setPkg(changedPath, pkg);
			} else if (name === "CHANGELOG.md") {
				console.log("Updating changelog in", changedPath);
				// ...update `CHANGELOG.md`s with correct version
				let changelog = fs.readFileSync(changedPath, "utf8");
				// Replace version header in `miniflare` `CHANGELOG.md`
				changelog = changelog.replace(
					`## ${miniflareVersion}`,
					`## ${nextMiniflareVersion}`
				);
				// Replace `Updated dependencies` line in other `CHANGELOG.md`s
				changelog = changelog.replace(
					`- miniflare@${miniflareVersion}`,
					`- miniflare@${nextMiniflareVersion}`
				);
				fs.writeFileSync(changedPath, changelog);
			}
		}
	}

	// 4. Update the lockfile
	console.log("Updating lockfile...");
	execSync("pnpm install --lockfile-only", { stdio: "inherit" });
	console.log("Done.");
}

if (require.main === module) main();

import assert from "node:assert";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const projectRoot = path.resolve(__dirname, "../..");

const githubRunId = parseInt(process.env.GITHUB_RUN_ID);
assert(
	!Number.isNaN(githubRunId),
	"Expected GITHUB_RUN_ID variable to be a number"
);
const githubEventPath = process.env.GITHUB_EVENT_PATH;
assert(githubEventPath, "Expected GITHUB_EVENT_PATH variable to be defined");
const githubEventContents = fs.readFileSync(githubEventPath, "utf8");
const githubEvent = JSON.parse(githubEventContents);
const githubPullRequestNumber = githubEvent?.pull_request?.number;
assert(
	typeof githubPullRequestNumber === "number",
	`Expected valid pull_request event, got ${githubEventContents}`
);

/**
 * @typedef {object} ~PackageJsonWorkersSdk
 * @property {boolean} [prerelease]
 */

/**
 * @typedef {object} ~PackageJson
 * @property {string} name
 * @property {string} version
 * @property {Record<string, string>} [dependencies]
 * @property {Record<string, string>} [devDependencies]
 * @property {Record<string, string>} [peerDependencies]
 * @property {Record<string, string>} [optionalDependencies]
 * @property {~PackageJsonWorkersSdk} [workers-sdk]
 */

/**
 * @typedef {object} ~Package
 * @property {string} path
 * @property {~PackageJson} json
 */

/** @returns {string[]} */
function getPackagePaths() {
	const stdout = execSync(
		'pnpm list --filter="./packages/*" --recursive --depth=-1 --parseable',
		{ cwd: projectRoot, encoding: "utf8" }
	);
	return stdout.split("\n").filter((pkgPath) => path.isAbsolute(pkgPath));
}

/**
 * @param {string} pkgPath
 * @returns {~Package}
 */
function getPackage(pkgPath) {
	const json = fs.readFileSync(path.join(pkgPath, "package.json"), "utf8");
	return {
		path: pkgPath,
		json: JSON.parse(json),
	};
}

/** @param {~Package} pkg */
export function setPackage(pkg) {
	const json = JSON.stringify(pkg.json, null, "\t");
	fs.writeFileSync(path.join(pkg.path, "package.json"), json);
}

/** @returns {~Package[]} */
function getPackages() {
	return getPackagePaths().map(getPackage);
}

/** @returns {~Package[]} */
export function getPackagesForPrerelease() {
	return getPackages().filter((pkg) => pkg.json["workers-sdk"]?.prerelease);
}

/** @param {string} pkgName */
export function getPrereleaseArtifactName(pkgName) {
	const name = pkgName.replaceAll("@", "").replaceAll("/", "-");
	return `npm-package-${name}-${githubPullRequestNumber}`;
}

/** @param {string} pkgName */
export function getPrereleaseArtifactUrl(pkgName) {
	const artifactName = getPrereleaseArtifactName(pkgName);
	return `https://prerelease-registry.devprod.cloudflare.dev/workers-sdk/runs/${githubRunId}/${artifactName}`;
}

/** @param {string} pkgName */
export function getPrereleasePRArtifactUrl(pkgName) {
	const artifactName = getPrereleaseArtifactName(pkgName);
	return `https://prerelease-registry.devprod.cloudflare.dev/workers-sdk/prs/${githubPullRequestNumber}/${artifactName}`;
}

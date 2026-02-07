import assert from "node:assert";
import childProcess from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startMockNpmRegistry } from "@cloudflare/mock-npm-registry";
import { version } from "../package.json";
import type { GlobalSetupContext } from "vitest/node";

const repoRoot = path.resolve(__dirname, "../../..");
const packagesRoot = path.resolve(repoRoot, "packages");

// Using a global setup means we can modify tests without having to re-install
// packages into our temporary directory
export default async function ({ provide }: GlobalSetupContext) {
	const stop = await startMockNpmRegistry("@cloudflare/vitest-pool-workers");

	// Create temporary directory
	const projectPath = await createTestProject();
	childProcess.execSync("pnpm install", { cwd: projectPath, stdio: "ignore" });

	provide("tmpPoolInstallationPath", projectPath);

	// Cleanup temporary directory on teardown
	return async () => {
		console.log("Closing down local npm registry");
		await stop();

		console.log("Cleaning up temporary directory...");
		try {
			await fs.rm(projectPath, { recursive: true, maxRetries: 10 });
			// This sometimes fails on Windows with EBUSY
		} catch {}
	};
}

/**
 * Create a temporary package that contains vitest-pool-workers and vitest.
 */
async function createTestProject() {
	// Create temporary directory containing a space to avoid regressing on
	// https://github.com/cloudflare/workers-sdk/issues/5268
	const projectPath = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "vitest-pool-workers temp-"))
	);
	const packageJsonPath = path.join(projectPath, "package.json");
	const packageJson = {
		name: "vitest-pool-workers-e2e-tests",
		private: true,
		type: "module",
		devDependencies: {
			// Ensure we use the local version of vitest-pool-workers
			"@cloudflare/vitest-pool-workers": version,
			vitest: await getVitestPeerDep(),
		},
	};
	await fs.writeFile(packageJsonPath, JSON.stringify(packageJson));
	return projectPath;
}

/**
 * Get the version of `vitest` that is needed as a peer of vitest-pool-workers.
 */
async function getVitestPeerDep() {
	const poolPackageJsonPath = path.join(
		packagesRoot,
		"vitest-pool-workers/package.json"
	);
	const poolPackageJson = JSON.parse(
		await fs.readFile(poolPackageJsonPath, "utf8")
	);
	const poolVitestVersion = poolPackageJson.peerDependencies?.vitest;
	assert(
		typeof poolVitestVersion === "string",
		"Expected to find `vitest` peer dependency version"
	);
	return poolVitestVersion;
}

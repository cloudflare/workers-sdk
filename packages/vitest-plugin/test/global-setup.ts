import childProcess from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startMockNpmRegistry } from "@cloudflare/mock-npm-registry";
import { removeDir } from "@cloudflare/workers-utils";
import { version as installedVitestVersion } from "vitest/package.json";
import { version } from "../package.json";
import type { TestProject } from "vitest/node";

// Using a global setup means we can modify tests without having to re-install
// packages into our temporary directory
export default async function ({ provide }: TestProject) {
	const stop = await startMockNpmRegistry("@cloudflare/vitest-plugin");

	// Create temporary directory
	const projectPath = await createTestProject();
	childProcess.execSync("pnpm install", { cwd: projectPath, stdio: "ignore" });

	provide("tmpPoolInstallationPath", projectPath);

	// Cleanup temporary directory on teardown
	return async () => {
		console.log("Closing down local npm registry");
		await stop();

		console.log("Cleaning up temporary directory...");
		void removeDir(projectPath, { fireAndForget: true });
	};
}

/**
 * Create a temporary package that contains vitest-plugin and vitest.
 */
async function createTestProject() {
	// Create temporary directory containing a space to avoid regressing on
	// https://github.com/cloudflare/workers-sdk/issues/5268
	const projectPath = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "vitest-plugin temp-"))
	);
	const packageJsonPath = path.join(projectPath, "package.json");
	const vitestVersion = process.env.VITEST_VERSION ?? installedVitestVersion;
	const packageJson = {
		name: "vitest-plugin-e2e-tests",
		private: true,
		type: "module",
		devDependencies: {
			// Ensure we use the local version of vitest-plugin
			"@cloudflare/vitest-plugin": version,
			"@vitest/coverage-istanbul": vitestVersion,
			vitest: vitestVersion,
		},
	};
	await fs.writeFile(packageJsonPath, JSON.stringify(packageJson));
	// pnpm 10 blocks lifecycle scripts by default. The transitive deps
	// (workerd, esbuild) need their postinstall to download platform binaries.
	const workspaceYamlPath = path.join(projectPath, "pnpm-workspace.yaml");
	await fs.writeFile(
		workspaceYamlPath,
		[
			"packages:",
			'  - "."',
			// TEMPORARY: Remove once Vitest 5 has passed the release-age cooldown.
			"minimumReleaseAgeExclude:",
			'  - "@cloudflare/*"',
			'  - "miniflare"',
			'  - "wrangler"',
			'  - "workerd"',
			'  - "vitest"',
			'  - "@vitest/*"',
			"allowBuilds:",
			"  esbuild: true",
			"  workerd: true",
			"",
		].join("\n")
	);
	return projectPath;
}

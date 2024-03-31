import assert from "node:assert";
import childProcess from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { GlobalSetupContext } from "vitest/node";

function packPackage(packDestinationPath: string, packagePath: string) {
	const output = childProcess.execSync(
		`pnpm pack --pack-destination ${packDestinationPath}`,
		{ cwd: packagePath, encoding: "utf8" }
	);
	const tarballPath = output.split("\n").find((line) => line.endsWith(".tgz"));
	assert(
		tarballPath !== undefined && path.isAbsolute(tarballPath),
		`Expected absolute tarball path in ${JSON.stringify(output)}`
	);
	return tarballPath;
}

// Using a global setup means we can modify tests without having to re-install
// packages into our temporary directory
export default async function ({ provide }: GlobalSetupContext) {
	console.log("Installing packages to temporary directory...");

	// Create temporary directory containing space to avoid regressing on
	// https://github.com/cloudflare/workers-sdk/issues/5268
	const tmpPath = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "vitest-pool-workers temp"))
	);

	// Pack `miniflare`, `wrangler` and `vitest-pool-workers` into tarballs
	const packDestinationPath = path.join(tmpPath, "packed");
	const packagesRoot = path.resolve(__dirname, "../..");
	const miniflareTarballPath = packPackage(
		packDestinationPath,
		path.join(packagesRoot, "miniflare")
	);
	const wranglerTarballPath = packPackage(
		packDestinationPath,
		path.join(packagesRoot, "wrangler")
	);
	const poolTarballPath = packPackage(
		packDestinationPath,
		path.join(packagesRoot, "vitest-pool-workers")
	);

	// Get required `vitest` version
	const poolPackageJsonPath = path.join(
		packagesRoot,
		"vitest-pool-workers/package.json"
	);
	const poolPackageJson = JSON.parse(
		await fs.readFile(poolPackageJsonPath, "utf8")
	);
	const poolVitestVersion = poolPackageJson.peerDependencies?.vitest;
	assert(
		poolVitestVersion,
		"Expected to find `vitest` peer dependency version"
	);

	// Install packages into temporary directory
	const packageJsonPath = path.join(tmpPath, "package.json");
	const packageJson = {
		name: "vitest-pool-workers-e2e-tests",
		private: true,
		type: "module",
		devDependencies: {
			"@cloudflare/vitest-pool-workers": poolTarballPath,
			vitest: poolVitestVersion,
		},
		pnpm: {
			overrides: {
				miniflare: miniflareTarballPath,
				wrangler: wranglerTarballPath,
			},
		},
	};
	await fs.writeFile(packageJsonPath, JSON.stringify(packageJson));
	childProcess.execSync("pnpm install", { cwd: tmpPath, stdio: "inherit" });

	provide("tmpPoolInstallationPath", tmpPath);

	// Cleanup temporary directory on teardown
	return async () => {
		console.log("Cleaning up temporary directory...");
		await fs.rm(tmpPath, { recursive: true, maxRetries: 10 });
	};
}

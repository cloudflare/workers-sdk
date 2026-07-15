import assert from "node:assert";
import * as fs from "node:fs";
import { describe, it } from "vitest";
import { getInstalledPackageVersion } from "../../src/package-resolution/package-resolution";
import { runInTempDir, seed } from "../../src/test-helpers";

/**
 * Convenience wrapper that calls {@link getInstalledPackageVersion} with
 * caching disabled, so each test gets a fresh lockfile parse without
 * needing global cache teardown.
 *
 * @param packageName - The name of the target package
 * @param projectPath - The path of the project to check
 * @returns The installed version string, or `undefined`
 */
function resolvePackageVersion(packageName: string, projectPath: string) {
	return getInstalledPackageVersion(packageName, projectPath, {
		cache: false,
	});
}

describe("getInstalledPackageVersion", () => {
	runInTempDir();

	it("returns the version from a lockfile when present", ({ expect }) => {
		fs.writeFileSync(
			"package-lock.json",
			JSON.stringify({
				lockfileVersion: 3,
				packages: {
					"": { name: "test", version: "1.0.0" },
					"node_modules/lodash": { version: "4.17.21" },
				},
			})
		);

		const version = resolvePackageVersion("lodash", process.cwd());
		expect(version).toBe("4.17.21");
	});

	it("falls back to node_modules when package is not in the lockfile", async ({
		expect,
	}) => {
		// Lockfile exists but doesn't contain "express"
		fs.writeFileSync(
			"package-lock.json",
			JSON.stringify({
				lockfileVersion: 3,
				packages: {
					"": { name: "test", version: "1.0.0" },
					"node_modules/lodash": { version: "4.17.21" },
				},
			})
		);

		// Seed node_modules with "express"
		await seed({
			"node_modules/express/package.json": JSON.stringify({
				name: "express",
				version: "4.18.2",
				main: "index.js",
			}),
			"node_modules/express/index.js": "module.exports = {}",
		});

		const version = resolvePackageVersion("express", process.cwd());
		expect(version).toBe("4.18.2");
	});

	it("falls back to node_modules when no lockfile exists", async ({
		expect,
	}) => {
		await seed({
			"node_modules/lodash/package.json": JSON.stringify({
				name: "lodash",
				version: "4.17.21",
				main: "index.js",
			}),
			"node_modules/lodash/index.js": "module.exports = {}",
		});

		const version = resolvePackageVersion("lodash", process.cwd());
		expect(version).toBe("4.17.21");
	});

	it("prefers the lockfile version over a differing node_modules version", async ({
		expect,
	}) => {
		fs.writeFileSync(
			"package-lock.json",
			JSON.stringify({
				lockfileVersion: 3,
				packages: {
					"": { name: "test", version: "1.0.0" },
					"node_modules/lodash": { version: "4.17.21" },
				},
			})
		);

		// node_modules has a different (older) version
		await seed({
			"node_modules/lodash/package.json": JSON.stringify({
				name: "lodash",
				version: "4.17.20",
				main: "index.js",
			}),
			"node_modules/lodash/index.js": "module.exports = {}",
		});

		const version = resolvePackageVersion("lodash", process.cwd());
		// Lockfile takes precedence
		expect(version).toBe("4.17.21");
	});

	it("falls back to node_modules for aliased deps (lockfile skips aliases)", async ({
		expect,
	}) => {
		// The lockfile has an alias entry — aliases are intentionally excluded
		// from lockfile results so they fall through to node_modules resolution,
		// which handles vite+ bundledVersions correctly.
		fs.writeFileSync(
			"package-lock.json",
			JSON.stringify({
				lockfileVersion: 3,
				packages: {
					"": { name: "test", version: "1.0.0" },
					"node_modules/vite": {
						// `name` differs from key → alias → skipped by lockfile parser
						name: "@voidzero-dev/vite-plus-core",
						version: "0.2.2",
					},
					"node_modules/lodash": { version: "4.17.21" },
				},
			})
		);

		// node_modules has the aliased package with bundledVersions
		await seed({
			"node_modules/vite/package.json": JSON.stringify({
				name: "@voidzero-dev/vite-plus-core",
				version: "0.2.2",
				bundledVersions: {
					vite: "8.1.2",
					rolldown: "1.0.0",
				},
				main: "index.js",
			}),
			"node_modules/vite/index.js": "module.exports = {}",
		});

		const version = resolvePackageVersion("vite", process.cwd());
		// Lockfile skipped the alias → node_modules fallback → bundledVersions
		expect(version).toBe("8.1.2");
	});

	it("returns undefined when the package is not installed anywhere", ({
		expect,
	}) => {
		// No lockfile, no node_modules
		const version = resolvePackageVersion("nonexistent-pkg", process.cwd());
		expect(version).toBeUndefined();
	});

	it("returns undefined when lockfile exists but package is absent from both", ({
		expect,
	}) => {
		fs.writeFileSync(
			"package-lock.json",
			JSON.stringify({
				lockfileVersion: 3,
				packages: {
					"": { name: "test", version: "1.0.0" },
					"node_modules/lodash": { version: "4.17.21" },
				},
			})
		);

		// Use a package name that doesn't exist anywhere in the monorepo's
		// node_modules tree — "express" would be found via require.resolve
		// walking up to the root.
		const version = resolvePackageVersion(
			"@test/nonexistent-pkg-12345",
			process.cwd()
		);
		expect(version).toBeUndefined();
	});

	it("resolves from a pnpm lockfile", ({ expect }) => {
		fs.writeFileSync(
			"pnpm-lock.yaml",
			[
				"lockfileVersion: '9.0'",
				"",
				"importers:",
				"  .:",
				"    dependencies:",
				"      lodash:",
				"        specifier: ^4.17.21",
				"        version: 4.17.21",
			].join("\n")
		);

		const version = resolvePackageVersion("lodash", process.cwd());
		expect(version).toBe("4.17.21");
	});

	it("resolves from a yarn berry lockfile", ({ expect }) => {
		fs.writeFileSync(
			"yarn.lock",
			[
				"__metadata:",
				"  version: 8",
				"",
				'"lodash@npm:^4.17.21":',
				"  version: 4.17.21",
				'  resolution: "lodash@npm:4.17.21"',
				"  languageName: node",
				"  linkType: hard",
			].join("\n")
		);

		const version = resolvePackageVersion("lodash", process.cwd());
		expect(version).toBe("4.17.21");
	});

	it("resolves from a bun lockfile", ({ expect }) => {
		fs.writeFileSync(
			"bun.lock",
			JSON.stringify({
				lockfileVersion: 0,
				packages: {
					lodash: ["lodash@4.17.21", {}],
				},
			})
		);

		const version = resolvePackageVersion("lodash", process.cwd());
		expect(version).toBe("4.17.21");
	});

	it("stopAtProjectPath prevents lockfile discovery in ancestor directories", ({
		expect,
	}) => {
		// Lockfile is in the root (parent), but we query from a sub-project
		// with stopAtProjectPath: true — the lockfile should NOT be found
		fs.writeFileSync(
			"package-lock.json",
			JSON.stringify({
				lockfileVersion: 3,
				packages: {
					"": { name: "root", version: "1.0.0" },
					"node_modules/@opennextjs/cloudflare": { version: "1.14.4" },
				},
			})
		);

		const subDir = "sub-project";
		fs.mkdirSync(subDir, { recursive: true });

		// Without stopAtProjectPath, the ancestor lockfile is found
		const versionWithoutStop = getInstalledPackageVersion(
			"@opennextjs/cloudflare",
			`${process.cwd()}/${subDir}`,
			{
				cache: false,
			}
		);
		expect(versionWithoutStop).toBe("1.14.4");

		// With stopAtProjectPath, discovery stops at the sub-project directory
		const versionWithStop = getInstalledPackageVersion(
			"@opennextjs/cloudflare",
			`${process.cwd()}/${subDir}`,
			{
				stopAtProjectPath: true,
				cache: false,
			}
		);
		expect(versionWithStop).toBeUndefined();
	});

	it("resolves from a pnpm v5 single-project lockfile", ({ expect }) => {
		fs.writeFileSync(
			"pnpm-lock.yaml",
			[
				"lockfileVersion: 5.4",
				"",
				"specifiers:",
				"  lodash: ^4.17.21",
				"",
				"dependencies:",
				"  lodash: 4.17.21",
			].join("\n")
		);

		const version = resolvePackageVersion("lodash", process.cwd());
		expect(version).toBe("4.17.21");
	});

	it("handles pnpm v5 alias falling through to node_modules", async ({
		expect,
	}) => {
		fs.writeFileSync(
			"pnpm-lock.yaml",
			[
				"lockfileVersion: 5.4",
				"",
				"specifiers:",
				"  node-types: npm:@types/node@^16",
				"  lodash: ^4.17.21",
				"",
				"dependencies:",
				"  node-types: /@types/node/16.18.0",
				"  lodash: 4.17.21",
			].join("\n")
		);

		// "node-types" alias is skipped by lockfile, but resolvable via node_modules
		await seed({
			"node_modules/node-types/package.json": JSON.stringify({
				name: "@types/node",
				version: "16.18.0",
				main: "index.js",
			}),
			"node_modules/node-types/index.js": "module.exports = {}",
		});

		// lodash comes from lockfile
		const lodashVersion = resolvePackageVersion("lodash", process.cwd());
		expect(lodashVersion).toBe("4.17.21");

		// node-types falls through to node_modules (alias skipped by lockfile)
		const nodeTypesVersion = resolvePackageVersion("node-types", process.cwd());
		assert(nodeTypesVersion);
		expect(nodeTypesVersion).toBe("16.18.0");
	});
});

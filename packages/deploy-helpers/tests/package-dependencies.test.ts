import * as fs from "node:fs";
import * as path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { assert, describe, it } from "vitest";
import { collectPackageDependencies } from "../src/deploy/helpers/package-dependencies";

describe("collectPackageDependencies", () => {
	runInTempDir();

	it("should return undefined when no package.json exists", async ({
		expect,
	}) => {
		const result = await collectPackageDependencies(process.cwd());

		expect(result).toBeUndefined();
	});

	it("should return undefined when package.json has no dependencies", async ({
		expect,
	}) => {
		fs.writeFileSync(
			"package.json",
			JSON.stringify({ name: "test-project" }, null, 2)
		);

		const result = await collectPackageDependencies(process.cwd());

		expect(result).toBeUndefined();
	});

	it("should skip workspace dependencies", async ({ expect }) => {
		fs.writeFileSync(
			"package.json",
			JSON.stringify(
				{
					name: "test-project",
					dependencies: {
						"local-package": "workspace:*",
						"another-local": "workspace:^",
					},
				},
				null,
				2
			)
		);

		const result = await collectPackageDependencies(process.cwd());

		expect(result).toBeUndefined();
	});

	it("should skip catalog dependencies", async ({ expect }) => {
		fs.writeFileSync(
			"package.json",
			JSON.stringify(
				{
					name: "test-project",
					dependencies: {
						"catalog-package": "catalog:",
						"catalog-named": "catalog:default",
					},
				},
				null,
				2
			)
		);

		const result = await collectPackageDependencies(process.cwd());

		expect(result).toBeUndefined();
	});

	it("should collect public package dependencies", async ({ expect }) => {
		const nodeModulesPath = path.join(process.cwd(), "node_modules");
		const packagePath = path.join(nodeModulesPath, "test-public-package");
		fs.mkdirSync(packagePath, { recursive: true });
		fs.writeFileSync(path.join(packagePath, "index.js"), "module.exports = {}");
		fs.writeFileSync(
			path.join(packagePath, "package.json"),
			JSON.stringify(
				{
					name: "test-public-package",
					version: "1.2.3",
				},
				null,
				2
			)
		);

		fs.writeFileSync(
			"package.json",
			JSON.stringify(
				{
					name: "test-project",
					dependencies: {
						"test-public-package": "^1.0.0",
					},
				},
				null,
				2
			)
		);

		const result = await collectPackageDependencies(process.cwd());

		expect(result).toEqual([
			{
				name: "test-public-package",
				packageJsonVersion: "^1.0.0",
				installedVersion: "1.2.3",
			},
		]);
	});

	it("should collect from both dependencies and devDependencies", async ({
		expect,
	}) => {
		const nodeModulesPath = path.join(process.cwd(), "node_modules");

		// Create a regular dependency
		const depPath = path.join(nodeModulesPath, "prod-dep");
		fs.mkdirSync(depPath, { recursive: true });
		fs.writeFileSync(path.join(depPath, "index.js"), "module.exports = {}");
		fs.writeFileSync(
			path.join(depPath, "package.json"),
			JSON.stringify({ name: "prod-dep", version: "1.0.0" }, null, 2)
		);

		// Create a dev dependency
		const devDepPath = path.join(nodeModulesPath, "dev-dep");
		fs.mkdirSync(devDepPath, { recursive: true });
		fs.writeFileSync(path.join(devDepPath, "index.js"), "module.exports = {}");
		fs.writeFileSync(
			path.join(devDepPath, "package.json"),
			JSON.stringify({ name: "dev-dep", version: "2.0.0" }, null, 2)
		);

		fs.writeFileSync(
			"package.json",
			JSON.stringify(
				{
					name: "test-project",
					dependencies: {
						"prod-dep": "^1.0.0",
					},
					devDependencies: {
						"dev-dep": "^2.0.0",
					},
				},
				null,
				2
			)
		);

		const result = await collectPackageDependencies(process.cwd());

		expect(result).toEqual([
			{
				name: "prod-dep",
				packageJsonVersion: "^1.0.0",
				installedVersion: "1.0.0",
			},
			{
				name: "dev-dep",
				packageJsonVersion: "^2.0.0",
				installedVersion: "2.0.0",
			},
		]);
	});

	it("should skip file: and link: dependencies", async ({ expect }) => {
		fs.writeFileSync(
			"package.json",
			JSON.stringify(
				{
					name: "test-project",
					dependencies: {
						"local-file-pkg": "file:../local-file-pkg",
						"local-link-pkg": "link:../local-link-pkg",
					},
				},
				null,
				2
			)
		);

		const result = await collectPackageDependencies(process.cwd());

		expect(result).toBeUndefined();
	});

	it("should skip dependencies that cannot be resolved", async ({ expect }) => {
		fs.writeFileSync(
			"package.json",
			JSON.stringify(
				{
					name: "test-project",
					dependencies: {
						"nonexistent-package": "^1.0.0",
					},
				},
				null,
				2
			)
		);

		const result = await collectPackageDependencies(process.cwd());

		expect(result).toBeUndefined();
	});

	it("should handle mixed dependencies correctly", async ({ expect }) => {
		const nodeModulesPath = path.join(process.cwd(), "node_modules");

		// Create an installed package
		const publicPath = path.join(nodeModulesPath, "public-pkg");
		fs.mkdirSync(publicPath, { recursive: true });
		fs.writeFileSync(path.join(publicPath, "index.js"), "module.exports = {}");
		fs.writeFileSync(
			path.join(publicPath, "package.json"),
			JSON.stringify({ name: "public-pkg", version: "1.0.0" }, null, 2)
		);

		// Create another installed package
		const anotherPath = path.join(nodeModulesPath, "another-pkg");
		fs.mkdirSync(anotherPath, { recursive: true });
		fs.writeFileSync(path.join(anotherPath, "index.js"), "module.exports = {}");
		fs.writeFileSync(
			path.join(anotherPath, "package.json"),
			JSON.stringify({ name: "another-pkg", version: "2.0.0" }, null, 2)
		);

		fs.writeFileSync(
			"package.json",
			JSON.stringify(
				{
					name: "test-project",
					dependencies: {
						"public-pkg": "^1.0.0",
						"another-pkg": "^2.0.0",
						"workspace-pkg": "workspace:^",
						"local-pkg": "file:../local-pkg",
						"nonexistent-pkg": "^3.0.0",
					},
				},
				null,
				2
			)
		);

		const result = await collectPackageDependencies(process.cwd());

		expect(result).toEqual([
			{
				name: "public-pkg",
				packageJsonVersion: "^1.0.0",
				installedVersion: "1.0.0",
			},
			{
				name: "another-pkg",
				packageJsonVersion: "^2.0.0",
				installedVersion: "2.0.0",
			},
		]);
	});

	it("should cap at 200 entries", async ({ expect }) => {
		const nodeModulesPath = path.join(process.cwd(), "node_modules");
		const dependencies: Record<string, string> = {};

		// Create 210 packages
		for (let i = 0; i < 210; i++) {
			const pkgName = `pkg-${String(i).padStart(3, "0")}`;
			const pkgPath = path.join(nodeModulesPath, pkgName);
			fs.mkdirSync(pkgPath, { recursive: true });
			fs.writeFileSync(path.join(pkgPath, "index.js"), "module.exports = {}");
			fs.writeFileSync(
				path.join(pkgPath, "package.json"),
				JSON.stringify({ name: pkgName, version: `1.0.${i}` }, null, 2)
			);
			dependencies[pkgName] = `^1.0.${i}`;
		}

		fs.writeFileSync(
			"package.json",
			JSON.stringify(
				{
					name: "test-project",
					dependencies,
				},
				null,
				2
			)
		);

		const result = await collectPackageDependencies(process.cwd());

		expect(result).toBeDefined();
		expect(result).toHaveLength(200);
	});

	describe("exclude_packages", () => {
		it("should exclude packages matching an exact name", async ({ expect }) => {
			const nodeModulesPath = path.join(process.cwd(), "node_modules");

			for (const pkgName of ["keep-me", "exclude-me"]) {
				const pkgPath = path.join(nodeModulesPath, pkgName);
				fs.mkdirSync(pkgPath, { recursive: true });
				fs.writeFileSync(path.join(pkgPath, "index.js"), "module.exports = {}");
				fs.writeFileSync(
					path.join(pkgPath, "package.json"),
					JSON.stringify({ name: pkgName, version: "1.0.0" }, null, 2)
				);
			}

			fs.writeFileSync(
				"package.json",
				JSON.stringify(
					{
						name: "test-project",
						dependencies: {
							"keep-me": "^1.0.0",
							"exclude-me": "^1.0.0",
						},
					},
					null,
					2
				)
			);

			const result = await collectPackageDependencies(process.cwd(), {
				excludePackages: ["exclude-me"],
			});

			expect(result).toEqual([
				{
					name: "keep-me",
					packageJsonVersion: "^1.0.0",
					installedVersion: "1.0.0",
				},
			]);
		});

		it("should exclude packages matching a glob pattern with wildcard prefix", async ({
			expect,
		}) => {
			const nodeModulesPath = path.join(process.cwd(), "node_modules");

			for (const pkgName of ["my-utils", "other-utils", "keep-pkg"]) {
				const pkgPath = path.join(nodeModulesPath, pkgName);
				fs.mkdirSync(pkgPath, { recursive: true });
				fs.writeFileSync(path.join(pkgPath, "index.js"), "module.exports = {}");
				fs.writeFileSync(
					path.join(pkgPath, "package.json"),
					JSON.stringify({ name: pkgName, version: "1.0.0" }, null, 2)
				);
			}

			fs.writeFileSync(
				"package.json",
				JSON.stringify(
					{
						name: "test-project",
						dependencies: {
							"my-utils": "^1.0.0",
							"other-utils": "^1.0.0",
							"keep-pkg": "^1.0.0",
						},
					},
					null,
					2
				)
			);

			const result = await collectPackageDependencies(process.cwd(), {
				excludePackages: ["*-utils"],
			});

			expect(result).toEqual([
				{
					name: "keep-pkg",
					packageJsonVersion: "^1.0.0",
					installedVersion: "1.0.0",
				},
			]);
		});

		it("should exclude scoped packages matching a glob pattern", async ({
			expect,
		}) => {
			const nodeModulesPath = path.join(process.cwd(), "node_modules");

			// Create scoped packages
			const scopedPkgs = ["@internal/foo", "@internal/bar", "@public/baz"];
			for (const pkgName of scopedPkgs) {
				const pkgPath = path.join(nodeModulesPath, pkgName);
				fs.mkdirSync(pkgPath, { recursive: true });
				fs.writeFileSync(path.join(pkgPath, "index.js"), "module.exports = {}");
				fs.writeFileSync(
					path.join(pkgPath, "package.json"),
					JSON.stringify({ name: pkgName, version: "2.0.0" }, null, 2)
				);
			}

			fs.writeFileSync(
				"package.json",
				JSON.stringify(
					{
						name: "test-project",
						dependencies: {
							"@internal/foo": "^2.0.0",
							"@internal/bar": "^2.0.0",
							"@public/baz": "^2.0.0",
						},
					},
					null,
					2
				)
			);

			const result = await collectPackageDependencies(process.cwd(), {
				excludePackages: ["@internal/*"],
			});

			expect(result).toEqual([
				{
					name: "@public/baz",
					packageJsonVersion: "^2.0.0",
					installedVersion: "2.0.0",
				},
			]);
		});

		it("should not exclude anything when excludePackages is an empty array", async ({
			expect,
		}) => {
			const nodeModulesPath = path.join(process.cwd(), "node_modules");

			const pkgPath = path.join(nodeModulesPath, "some-pkg");
			fs.mkdirSync(pkgPath, { recursive: true });
			fs.writeFileSync(path.join(pkgPath, "index.js"), "module.exports = {}");
			fs.writeFileSync(
				path.join(pkgPath, "package.json"),
				JSON.stringify({ name: "some-pkg", version: "1.0.0" }, null, 2)
			);

			fs.writeFileSync(
				"package.json",
				JSON.stringify(
					{
						name: "test-project",
						dependencies: {
							"some-pkg": "^1.0.0",
						},
					},
					null,
					2
				)
			);

			const result = await collectPackageDependencies(process.cwd(), {
				excludePackages: [],
			});

			expect(result).toEqual([
				{
					name: "some-pkg",
					packageJsonVersion: "^1.0.0",
					installedVersion: "1.0.0",
				},
			]);
		});

		it("should not exclude anything when no pattern matches", async ({
			expect,
		}) => {
			const nodeModulesPath = path.join(process.cwd(), "node_modules");

			const pkgPath = path.join(nodeModulesPath, "some-pkg");
			fs.mkdirSync(pkgPath, { recursive: true });
			fs.writeFileSync(path.join(pkgPath, "index.js"), "module.exports = {}");
			fs.writeFileSync(
				path.join(pkgPath, "package.json"),
				JSON.stringify({ name: "some-pkg", version: "1.0.0" }, null, 2)
			);

			fs.writeFileSync(
				"package.json",
				JSON.stringify(
					{
						name: "test-project",
						dependencies: {
							"some-pkg": "^1.0.0",
						},
					},
					null,
					2
				)
			);

			const result = await collectPackageDependencies(process.cwd(), {
				excludePackages: ["@other/*", "unrelated-*"],
			});

			expect(result).toEqual([
				{
					name: "some-pkg",
					packageJsonVersion: "^1.0.0",
					installedVersion: "1.0.0",
				},
			]);
		});

		it("should not count excluded packages toward the 200 cap", async ({
			expect,
		}) => {
			const nodeModulesPath = path.join(process.cwd(), "node_modules");
			const dependencies: Record<string, string> = {};

			// Create 201 packages: 1 excluded + 200 kept
			const excludedPkg = "excluded-pkg";
			const excludedPath = path.join(nodeModulesPath, excludedPkg);
			fs.mkdirSync(excludedPath, { recursive: true });
			fs.writeFileSync(
				path.join(excludedPath, "index.js"),
				"module.exports = {}"
			);
			fs.writeFileSync(
				path.join(excludedPath, "package.json"),
				JSON.stringify({ name: excludedPkg, version: "1.0.0" }, null, 2)
			);
			dependencies[excludedPkg] = "^1.0.0";

			for (let i = 0; i < 200; i++) {
				const pkgName = `pkg-${String(i).padStart(3, "0")}`;
				const pkgPath = path.join(nodeModulesPath, pkgName);
				fs.mkdirSync(pkgPath, { recursive: true });
				fs.writeFileSync(path.join(pkgPath, "index.js"), "module.exports = {}");
				fs.writeFileSync(
					path.join(pkgPath, "package.json"),
					JSON.stringify({ name: pkgName, version: `1.0.${i}` }, null, 2)
				);
				dependencies[pkgName] = `^1.0.${i}`;
			}

			fs.writeFileSync(
				"package.json",
				JSON.stringify(
					{
						name: "test-project",
						dependencies,
					},
					null,
					2
				)
			);

			const result = await collectPackageDependencies(process.cwd(), {
				excludePackages: ["excluded-pkg"],
			});

			assert(result);
			expect(result).toHaveLength(200);
			expect(result.find((d) => d.name === "excluded-pkg")).toBeUndefined();
		});

		it("should support multiple exclusion patterns", async ({ expect }) => {
			const nodeModulesPath = path.join(process.cwd(), "node_modules");

			const pkgNames = [
				"@internal/core",
				"lodash",
				"secret-tool",
				"public-lib",
			];
			for (const pkgName of pkgNames) {
				const pkgPath = path.join(nodeModulesPath, pkgName);
				fs.mkdirSync(pkgPath, { recursive: true });
				fs.writeFileSync(path.join(pkgPath, "index.js"), "module.exports = {}");
				fs.writeFileSync(
					path.join(pkgPath, "package.json"),
					JSON.stringify({ name: pkgName, version: "1.0.0" }, null, 2)
				);
			}

			fs.writeFileSync(
				"package.json",
				JSON.stringify(
					{
						name: "test-project",
						dependencies: {
							"@internal/core": "^1.0.0",
							lodash: "^1.0.0",
							"secret-tool": "^1.0.0",
							"public-lib": "^1.0.0",
						},
					},
					null,
					2
				)
			);

			const result = await collectPackageDependencies(process.cwd(), {
				excludePackages: ["@internal/*", "secret-*"],
			});

			expect(result).toEqual([
				{
					name: "lodash",
					packageJsonVersion: "^1.0.0",
					installedVersion: "1.0.0",
				},
				{
					name: "public-lib",
					packageJsonVersion: "^1.0.0",
					installedVersion: "1.0.0",
				},
			]);
		});
	});

	it("should use devDependencies version when duplicate exists in dependencies", async ({
		expect,
	}) => {
		const nodeModulesPath = path.join(process.cwd(), "node_modules");

		const pkgPath = path.join(nodeModulesPath, "shared-pkg");
		fs.mkdirSync(pkgPath, { recursive: true });
		fs.writeFileSync(path.join(pkgPath, "index.js"), "module.exports = {}");
		fs.writeFileSync(
			path.join(pkgPath, "package.json"),
			JSON.stringify({ name: "shared-pkg", version: "1.5.0" }, null, 2)
		);

		fs.writeFileSync(
			"package.json",
			JSON.stringify(
				{
					name: "test-project",
					dependencies: {
						"shared-pkg": "^1.0.0",
					},
					devDependencies: {
						"shared-pkg": "^1.5.0",
					},
				},
				null,
				2
			)
		);

		const result = await collectPackageDependencies(process.cwd());

		// devDependencies spread over dependencies, so devDependencies version wins
		expect(result).toEqual([
			{
				name: "shared-pkg",
				packageJsonVersion: "^1.5.0",
				installedVersion: "1.5.0",
			},
		]);
	});

	describe("caching", () => {
		/**
		 * Sets up a minimal project with a single installed npm package in node_modules.
		 *
		 * @param cwd - The directory to set up the project in
		 * @param opts - Options for the package name, version constraint, and installed version
		 */
		function seedProjectWithPackage(
			cwd: string,
			opts: {
				packageName?: string;
				packageJsonVersion?: string;
				installedVersion?: string;
			} = {}
		) {
			const {
				packageName = "test-pkg",
				packageJsonVersion = "^1.0.0",
				installedVersion = "1.0.0",
			} = opts;
			const nodeModulesPath = path.join(cwd, "node_modules");
			const pkgPath = path.join(nodeModulesPath, packageName);
			fs.mkdirSync(pkgPath, { recursive: true });
			fs.writeFileSync(path.join(pkgPath, "index.js"), "module.exports = {}");
			fs.writeFileSync(
				path.join(pkgPath, "package.json"),
				JSON.stringify(
					{ name: packageName, version: installedVersion },
					null,
					2
				)
			);
			fs.writeFileSync(
				path.join(cwd, "package.json"),
				JSON.stringify(
					{
						name: "test-project",
						dependencies: { [packageName]: packageJsonVersion },
					},
					null,
					2
				)
			);
		}

		it("should write a cache file and return cached results on second call", async ({
			expect,
		}) => {
			const cwd = process.cwd();
			const cacheDir = path.join(cwd, ".cache");
			seedProjectWithPackage(cwd);

			const first = await collectPackageDependencies(cwd, { cacheDir });

			expect(first).toEqual([
				{
					name: "test-pkg",
					packageJsonVersion: "^1.0.0",
					installedVersion: "1.0.0",
				},
			]);

			// Cache file should exist on disk
			const cachePath = path.join(cacheDir, "package-dependencies.json");
			expect(fs.existsSync(cachePath)).toBe(true);

			const second = await collectPackageDependencies(cwd, { cacheDir });
			expect(second).toEqual(first);
		});

		it("should invalidate cache when package.json changes", async ({
			expect,
		}) => {
			const cwd = process.cwd();
			const cacheDir = path.join(cwd, ".cache");
			seedProjectWithPackage(cwd);

			const first = await collectPackageDependencies(cwd, { cacheDir });
			expect(first).toHaveLength(1);

			// Add a second dependency
			const newPkgPath = path.join(cwd, "node_modules", "new-pkg");
			fs.mkdirSync(newPkgPath, { recursive: true });
			fs.writeFileSync(
				path.join(newPkgPath, "index.js"),
				"module.exports = {}"
			);
			fs.writeFileSync(
				path.join(newPkgPath, "package.json"),
				JSON.stringify({ name: "new-pkg", version: "2.0.0" }, null, 2)
			);
			fs.writeFileSync(
				path.join(cwd, "package.json"),
				JSON.stringify(
					{
						name: "test-project",
						dependencies: {
							"test-pkg": "^1.0.0",
							"new-pkg": "^2.0.0",
						},
					},
					null,
					2
				)
			);

			const second = await collectPackageDependencies(cwd, { cacheDir });
			expect(second).toHaveLength(2);
			expect(second).toEqual(
				expect.arrayContaining([expect.objectContaining({ name: "new-pkg" })])
			);
		});

		it("should invalidate cache when lockfile content changes", async ({
			expect,
		}) => {
			const cwd = process.cwd();
			const cacheDir = path.join(cwd, ".cache");
			seedProjectWithPackage(cwd);

			// Create a lockfile
			fs.writeFileSync(
				path.join(cwd, "package-lock.json"),
				JSON.stringify({ lockfileVersion: 1 })
			);

			const first = await collectPackageDependencies(cwd, { cacheDir });
			expect(first).toHaveLength(1);

			// Modify the lockfile content (simulates a new `npm install`)
			fs.writeFileSync(
				path.join(cwd, "package-lock.json"),
				JSON.stringify({ lockfileVersion: 2 })
			);

			// Update the installed version to verify the cache was really invalidated
			fs.writeFileSync(
				path.join(cwd, "node_modules", "test-pkg", "package.json"),
				JSON.stringify({ name: "test-pkg", version: "1.0.1" }, null, 2)
			);

			const second = await collectPackageDependencies(cwd, { cacheDir });
			expect(second).toEqual([
				{
					name: "test-pkg",
					packageJsonVersion: "^1.0.0",
					installedVersion: "1.0.1",
				},
			]);
		});

		it("should work when no lockfile exists", async ({ expect }) => {
			const cwd = process.cwd();
			const cacheDir = path.join(cwd, ".cache");
			seedProjectWithPackage(cwd);

			// No lockfile present — cache should still work based on package.json hash
			const first = await collectPackageDependencies(cwd, { cacheDir });
			expect(first).toHaveLength(1);

			const second = await collectPackageDependencies(cwd, { cacheDir });
			expect(second).toEqual(first);
		});

		it("should detect lockfile in a parent directory (monorepo)", async ({
			expect,
		}) => {
			const cwd = process.cwd();

			// Simulate a monorepo: lockfile at workspace root, sub-package below
			const subPkg = path.join(cwd, "packages", "my-worker");
			fs.mkdirSync(subPkg, { recursive: true });

			// Lockfile lives at the workspace root (cwd), not in the sub-package
			fs.writeFileSync(
				path.join(cwd, "pnpm-lock.yaml"),
				"lockfileVersion: 9.0"
			);

			// Set up the sub-package with a dependency
			seedProjectWithPackage(subPkg);

			const cacheDir = path.join(subPkg, ".cache");
			const first = await collectPackageDependencies(subPkg, { cacheDir });
			expect(first).toHaveLength(1);

			// Second call should hit cache
			const second = await collectPackageDependencies(subPkg, { cacheDir });
			expect(second).toEqual(first);

			// Changing the root lockfile content should invalidate the cache
			fs.writeFileSync(
				path.join(cwd, "pnpm-lock.yaml"),
				"lockfileVersion: 9.1"
			);

			// Update installed version to prove cache was invalidated
			fs.writeFileSync(
				path.join(subPkg, "node_modules", "test-pkg", "package.json"),
				JSON.stringify({ name: "test-pkg", version: "1.0.1" }, null, 2)
			);

			const third = await collectPackageDependencies(subPkg, { cacheDir });
			expect(third).toEqual([
				{
					name: "test-pkg",
					packageJsonVersion: "^1.0.0",
					installedVersion: "1.0.1",
				},
			]);
		});

		it("should handle corrupted cache file gracefully", async ({ expect }) => {
			const cwd = process.cwd();
			const cacheDir = path.join(cwd, ".cache");
			seedProjectWithPackage(cwd);

			// Write invalid JSON to the cache file
			fs.mkdirSync(cacheDir, { recursive: true });
			fs.writeFileSync(
				path.join(cacheDir, "package-dependencies.json"),
				"NOT VALID JSON{{{{"
			);

			const result = await collectPackageDependencies(cwd, { cacheDir });

			// Should fall through to fresh collection despite the bad cache
			expect(result).toEqual([
				{
					name: "test-pkg",
					packageJsonVersion: "^1.0.0",
					installedVersion: "1.0.0",
				},
			]);
		});

		it("should discard cache with structurally invalid content", async ({
			expect,
		}) => {
			const cwd = process.cwd();
			const cacheDir = path.join(cwd, ".cache");
			seedProjectWithPackage(cwd);

			// Write valid JSON that doesn't match the expected cache shape
			fs.mkdirSync(cacheDir, { recursive: true });
			fs.writeFileSync(
				path.join(cacheDir, "package-dependencies.json"),
				JSON.stringify({ unexpected: "shape", numbers: [1, 2, 3] })
			);

			const result = await collectPackageDependencies(cwd, { cacheDir });

			// Should fall through to fresh collection despite the bad cache shape
			expect(result).toEqual([
				{
					name: "test-pkg",
					packageJsonVersion: "^1.0.0",
					installedVersion: "1.0.0",
				},
			]);
		});

		it("should not cache when cacheDir is not provided", async ({ expect }) => {
			const cwd = process.cwd();
			const cacheDir = path.join(cwd, ".cache");
			seedProjectWithPackage(cwd);

			// Call without cacheDir
			const result = await collectPackageDependencies(cwd);
			expect(result).toHaveLength(1);

			// No cache file should exist
			expect(fs.existsSync(cacheDir)).toBe(false);
		});
	});
});

import * as fs from "node:fs";
import * as path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { collectPackageDependencies } from "../../deploy/deployment-metadata";

describe("collectPackageDependencies", () => {
	runInTempDir();

	it("should return undefined when no package.json exists", ({ expect }) => {
		const result = collectPackageDependencies(process.cwd());

		expect(result).toBeUndefined();
	});

	it("should return undefined when package.json has no dependencies", ({
		expect,
	}) => {
		fs.writeFileSync(
			"package.json",
			JSON.stringify({ name: "test-project" }, null, 2)
		);

		const result = collectPackageDependencies(process.cwd());

		expect(result).toBeUndefined();
	});

	it("should skip workspace dependencies", ({ expect }) => {
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

		const result = collectPackageDependencies(process.cwd());

		expect(result).toBeUndefined();
	});

	it("should skip catalog dependencies", ({ expect }) => {
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

		const result = collectPackageDependencies(process.cwd());

		expect(result).toBeUndefined();
	});

	it("should collect public package dependencies", ({ expect }) => {
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

		const result = collectPackageDependencies(process.cwd());

		expect(result).toEqual([
			{
				name: "test-public-package",
				packageJsonVersion: "^1.0.0",
				installedVersion: "1.2.3",
			},
		]);
	});

	it("should collect from both dependencies and devDependencies", ({
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

		const result = collectPackageDependencies(process.cwd());

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

	it("should skip private packages", ({ expect }) => {
		const nodeModulesPath = path.join(process.cwd(), "node_modules");
		const packagePath = path.join(nodeModulesPath, "@company/private-package");
		fs.mkdirSync(packagePath, { recursive: true });
		fs.writeFileSync(path.join(packagePath, "index.js"), "module.exports = {}");
		fs.writeFileSync(
			path.join(packagePath, "package.json"),
			JSON.stringify(
				{
					name: "@company/private-package",
					version: "2.0.0",
					private: true,
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
						"@company/private-package": "^2.0.0",
					},
				},
				null,
				2
			)
		);

		const result = collectPackageDependencies(process.cwd());

		expect(result).toBeUndefined();
	});

	it("should skip dependencies that cannot be resolved", ({ expect }) => {
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

		const result = collectPackageDependencies(process.cwd());

		expect(result).toBeUndefined();
	});

	it("should handle mixed dependencies correctly", ({ expect }) => {
		const nodeModulesPath = path.join(process.cwd(), "node_modules");

		// Create a public package
		const publicPath = path.join(nodeModulesPath, "public-pkg");
		fs.mkdirSync(publicPath, { recursive: true });
		fs.writeFileSync(path.join(publicPath, "index.js"), "module.exports = {}");
		fs.writeFileSync(
			path.join(publicPath, "package.json"),
			JSON.stringify({ name: "public-pkg", version: "1.0.0" }, null, 2)
		);

		// Create a private package
		const privatePath = path.join(nodeModulesPath, "private-pkg");
		fs.mkdirSync(privatePath, { recursive: true });
		fs.writeFileSync(path.join(privatePath, "index.js"), "module.exports = {}");
		fs.writeFileSync(
			path.join(privatePath, "package.json"),
			JSON.stringify(
				{ name: "private-pkg", version: "2.0.0", private: true },
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
						"public-pkg": "^1.0.0",
						"private-pkg": "^2.0.0",
						"workspace-pkg": "workspace:^",
						"nonexistent-pkg": "^3.0.0",
					},
				},
				null,
				2
			)
		);

		const result = collectPackageDependencies(process.cwd());

		expect(result).toEqual([
			{
				name: "public-pkg",
				packageJsonVersion: "^1.0.0",
				installedVersion: "1.0.0",
			},
		]);
	});

	it("should cap at 200 entries", ({ expect }) => {
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

		const result = collectPackageDependencies(process.cwd());

		expect(result).toBeDefined();
		expect(result).toHaveLength(200);
	});

	it("should use dependencies version when duplicate exists in devDependencies", ({
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

		const result = collectPackageDependencies(process.cwd());

		// devDependencies spread over dependencies, so devDependencies version wins
		expect(result).toEqual([
			{
				name: "shared-pkg",
				packageJsonVersion: "^1.5.0",
				installedVersion: "1.5.0",
			},
		]);
	});
});

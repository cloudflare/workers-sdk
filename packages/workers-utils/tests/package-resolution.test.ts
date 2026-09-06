import * as fs from "node:fs";
import * as path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import {
	getInstalledPackageVersion,
	getPackagePath,
	isPackageInstalled,
} from "../src/package-resolution";

/**
 * Creates a minimal CJS package in `node_modules/` under the current directory.
 *
 * @param name - Package name (supports scoped like `@scope/pkg`)
 * @param version - Version string to write into `package.json`
 */
function createCjsPackage(name: string, version: string): void {
	const pkgDir = path.join(process.cwd(), "node_modules", name);
	fs.mkdirSync(pkgDir, { recursive: true });
	fs.writeFileSync(path.join(pkgDir, "index.js"), "module.exports = {}");
	fs.writeFileSync(
		path.join(pkgDir, "package.json"),
		JSON.stringify({ name, version }, null, 2)
	);
}

/**
 * Creates a minimal ESM-only package in `node_modules/` under the current
 * directory. The package has `"type": "module"` and an exports map that only
 * provides an `"import"` condition — no `"require"`, no `"default"`, and no
 * `"./package.json"` export. This makes it invisible to `require.resolve`.
 *
 * @param name - Package name (supports scoped like `@scope/pkg`)
 * @param version - Version string to write into `package.json`
 */
function createEsmOnlyPackage(name: string, version: string): void {
	const pkgDir = path.join(process.cwd(), "node_modules", name);
	fs.mkdirSync(pkgDir, { recursive: true });
	fs.writeFileSync(path.join(pkgDir, "index.mjs"), "export default {}");
	fs.writeFileSync(
		path.join(pkgDir, "package.json"),
		JSON.stringify(
			{
				name,
				version,
				type: "module",
				exports: {
					".": {
						types: "./dist/index.d.ts",
						import: "./index.mjs",
					},
				},
			},
			null,
			2
		)
	);
}

describe("getPackagePath", () => {
	runInTempDir();

	it("should resolve a CJS package", ({ expect }) => {
		createCjsPackage("cjs-pkg", "1.0.0");

		const result = getPackagePath("cjs-pkg", process.cwd());

		expect(result).toBeDefined();
		expect(result).toContain(path.join("node_modules", "cjs-pkg"));
	});

	it("should resolve an ESM-only package via filesystem fallback", ({
		expect,
	}) => {
		createEsmOnlyPackage("esm-only-pkg", "2.0.0");

		const result = getPackagePath("esm-only-pkg", process.cwd());

		expect(result).toBe(
			path.join(process.cwd(), "node_modules", "esm-only-pkg")
		);
	});

	it("should resolve a scoped ESM-only package", ({ expect }) => {
		createEsmOnlyPackage("@cloudflare/think", "0.1.0");

		const result = getPackagePath("@cloudflare/think", process.cwd());

		expect(result).toBe(
			path.join(process.cwd(), "node_modules", "@cloudflare", "think")
		);
	});

	it("should return undefined for a non-existent package", ({ expect }) => {
		const result = getPackagePath("nonexistent-package", process.cwd());

		expect(result).toBeUndefined();
	});
});

describe("getInstalledPackageVersion", () => {
	runInTempDir();

	it("should return the version for a CJS package", ({ expect }) => {
		createCjsPackage("cjs-pkg", "3.2.1");

		const result = getInstalledPackageVersion("cjs-pkg", process.cwd());

		expect(result).toBe("3.2.1");
	});

	it("should return the version for an ESM-only package", ({ expect }) => {
		createEsmOnlyPackage("esm-only-pkg", "4.5.6");

		const result = getInstalledPackageVersion("esm-only-pkg", process.cwd());

		expect(result).toBe("4.5.6");
	});

	it("should return the version for a scoped ESM-only package", ({
		expect,
	}) => {
		createEsmOnlyPackage("@scope/esm-pkg", "0.3.0");

		const result = getInstalledPackageVersion("@scope/esm-pkg", process.cwd());

		expect(result).toBe("0.3.0");
	});

	it("should return undefined for a non-existent package", ({ expect }) => {
		const result = getInstalledPackageVersion(
			"nonexistent-package",
			process.cwd()
		);

		expect(result).toBeUndefined();
	});
});

describe("isPackageInstalled", () => {
	runInTempDir();

	it("should return true for a CJS package", ({ expect }) => {
		createCjsPackage("cjs-pkg", "1.0.0");

		expect(isPackageInstalled("cjs-pkg", process.cwd())).toBe(true);
	});

	it("should return true for an ESM-only package", ({ expect }) => {
		createEsmOnlyPackage("esm-only-pkg", "1.0.0");

		expect(isPackageInstalled("esm-only-pkg", process.cwd())).toBe(true);
	});

	it("should return false for a non-existent package", ({ expect }) => {
		expect(isPackageInstalled("nonexistent-package", process.cwd())).toBe(
			false
		);
	});
});

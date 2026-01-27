import { describe, expect, it } from "vitest";
import {
	getAllDependencies,
	getNonWorkspaceDependencies,
	getPublicPackages,
	validatePackageDependencies,
} from "../validate-package-dependencies";

describe("getAllDependencies()", () => {
	it("should return empty array for undefined", () => {
		expect(getAllDependencies(undefined)).toEqual([]);
	});

	it("should return empty array for empty object", () => {
		expect(getAllDependencies({})).toEqual([]);
	});

	it("should return all dependency names", () => {
		expect(
			getAllDependencies({
				foo: "1.0.0",
				bar: "workspace:*",
				baz: "^2.0.0",
			})
		).toEqual(["foo", "bar", "baz"]);
	});
});

describe("getNonWorkspaceDependencies()", () => {
	it("should return empty array for undefined", () => {
		expect(getNonWorkspaceDependencies(undefined)).toEqual([]);
	});

	it("should return empty array for empty object", () => {
		expect(getNonWorkspaceDependencies({})).toEqual([]);
	});

	it("should filter out workspace dependencies", () => {
		expect(
			getNonWorkspaceDependencies({
				foo: "1.0.0",
				bar: "workspace:*",
				baz: "workspace:^",
				qux: "^2.0.0",
			})
		).toEqual(["foo", "qux"]);
	});

	it("should return all deps if none are workspace deps", () => {
		expect(
			getNonWorkspaceDependencies({
				foo: "1.0.0",
				bar: "^2.0.0",
			})
		).toEqual(["foo", "bar"]);
	});
});

describe("validatePackageDependencies()", () => {
	it("should return no errors for package with no dependencies", () => {
		const errors = validatePackageDependencies(
			"test-package",
			"test-package",
			{ name: "test-package" },
			null
		);
		expect(errors).toEqual([]);
	});

	it("should return no errors for package with only workspace dependencies", () => {
		const errors = validatePackageDependencies(
			"test-package",
			"test-package",
			{
				name: "test-package",
				dependencies: {
					"@cloudflare/foo": "workspace:*",
					"@cloudflare/bar": "workspace:^",
				},
			},
			null
		);
		expect(errors).toEqual([]);
	});

	it("should return error when package has non-workspace deps but no allowlist", () => {
		const errors = validatePackageDependencies(
			"test-package",
			"test-package",
			{
				name: "test-package",
				dependencies: {
					lodash: "^4.0.0",
					zod: "^3.0.0",
				},
			},
			null
		);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('Package "test-package"');
		expect(errors[0]).toContain("2 non-workspace dependencies");
		expect(errors[0]).toContain("no scripts/deps.ts file");
		expect(errors[0]).toContain("lodash, zod");
	});

	it("should return no errors when all deps are in allowlist", () => {
		const errors = validatePackageDependencies(
			"test-package",
			"test-package",
			{
				name: "test-package",
				dependencies: {
					lodash: "^4.0.0",
					zod: "^3.0.0",
				},
			},
			["lodash", "zod"]
		);
		expect(errors).toEqual([]);
	});

	it("should return error for dependency not in allowlist", () => {
		const errors = validatePackageDependencies(
			"test-package",
			"test-package",
			{
				name: "test-package",
				dependencies: {
					lodash: "^4.0.0",
					zod: "^3.0.0",
					"new-dep": "^1.0.0",
				},
			},
			["lodash", "zod"]
		);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('Package "test-package"');
		expect(errors[0]).toContain('"new-dep"');
		expect(errors[0]).toContain("not listed in EXTERNAL_DEPENDENCIES");
	});

	it("should return error for stale allowlist entry", () => {
		const errors = validatePackageDependencies(
			"test-package",
			"test-package",
			{
				name: "test-package",
				dependencies: {
					lodash: "^4.0.0",
				},
			},
			["lodash", "removed-dep"]
		);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('Package "test-package"');
		expect(errors[0]).toContain('"removed-dep"');
		expect(errors[0]).toContain("not in dependencies or peerDependencies");
	});

	it("should allow workspace deps in EXTERNAL_DEPENDENCIES without error", () => {
		const errors = validatePackageDependencies(
			"test-package",
			"test-package",
			{
				name: "test-package",
				dependencies: {
					lodash: "^4.0.0",
					miniflare: "workspace:*",
				},
			},
			["lodash", "miniflare"]
		);
		expect(errors).toEqual([]);
	});

	it("should check peerDependencies for stale allowlist entries", () => {
		const errors = validatePackageDependencies(
			"test-package",
			"test-package",
			{
				name: "test-package",
				dependencies: {
					lodash: "^4.0.0",
				},
				peerDependencies: {
					vite: "^5.0.0",
				},
			},
			["lodash", "vite"]
		);
		expect(errors).toEqual([]);
	});

	it("should return multiple errors for multiple issues", () => {
		const errors = validatePackageDependencies(
			"test-package",
			"test-package",
			{
				name: "test-package",
				dependencies: {
					lodash: "^4.0.0",
					"undeclared-dep": "^1.0.0",
				},
			},
			["lodash", "stale-dep"]
		);
		expect(errors).toHaveLength(2);
		expect(errors[0]).toContain('"undeclared-dep"');
		expect(errors[1]).toContain('"stale-dep"');
	});

	it("should ignore devDependencies completely", () => {
		const errors = validatePackageDependencies(
			"test-package",
			"test-package",
			{
				name: "test-package",
				devDependencies: {
					vitest: "^1.0.0",
					typescript: "^5.0.0",
					esbuild: "^0.20.0",
				},
			},
			null // No allowlist needed since devDependencies are ignored
		);
		expect(errors).toEqual([]);
	});

	it("should ignore devDependencies when validating against allowlist", () => {
		const errors = validatePackageDependencies(
			"test-package",
			"test-package",
			{
				name: "test-package",
				dependencies: {
					lodash: "^4.0.0",
				},
				devDependencies: {
					// These should NOT trigger "not in allowlist" errors
					vitest: "^1.0.0",
					typescript: "^5.0.0",
					"some-dev-tool": "^1.0.0",
				},
			},
			["lodash"] // Only lodash in allowlist, devDependencies should be ignored
		);
		expect(errors).toEqual([]);
	});

	it("should not require devDependencies to be in allowlist", () => {
		const errors = validatePackageDependencies(
			"test-package",
			"test-package",
			{
				name: "test-package",
				dependencies: {
					lodash: "^4.0.0",
					zod: "^3.0.0",
				},
				devDependencies: {
					// Many devDependencies that are NOT in the allowlist
					vitest: "^1.0.0",
					typescript: "^5.0.0",
					esbuild: "^0.20.0",
					prettier: "^3.0.0",
					eslint: "^8.0.0",
				},
			},
			["lodash", "zod"] // Only runtime deps in allowlist
		);
		// Should pass - devDependencies don't need to be in allowlist
		expect(errors).toEqual([]);
	});

	it("should not count devDependencies as stale allowlist entries", () => {
		// If a package has something in devDependencies AND in the allowlist,
		// it should be flagged as stale (since devDeps are bundled, not external)
		const errors = validatePackageDependencies(
			"test-package",
			"test-package",
			{
				name: "test-package",
				dependencies: {
					lodash: "^4.0.0",
				},
				devDependencies: {
					// esbuild is in devDependencies (will be bundled)
					esbuild: "^0.20.0",
				},
			},
			["lodash", "esbuild"] // esbuild in allowlist but only in devDeps = stale
		);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('"esbuild"');
		expect(errors[0]).toContain("not in dependencies or peerDependencies");
	});
});

describe("getPublicPackages()", () => {
	it("should return only non-private packages", async () => {
		const packages = await getPublicPackages();

		// All returned packages should be non-private
		for (const pkg of packages) {
			expect(pkg.packageJson.private).not.toBe(true);
		}

		// Should include known public packages
		const packageNames = packages.map((p) => p.packageJson.name);
		expect(packageNames).toContain("wrangler");
		expect(packageNames).toContain("miniflare");
		expect(packageNames).toContain("create-cloudflare");
	});

	it("should not include private packages", async () => {
		const packages = await getPublicPackages();
		const packageNames = packages.map((p) => p.packageJson.name);

		// These are known private packages
		expect(packageNames).not.toContain("@cloudflare/workers-shared");
		expect(packageNames).not.toContain("@cloudflare/cli");
	});
});

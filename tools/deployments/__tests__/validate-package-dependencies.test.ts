import { describe, it } from "vitest";
import {
	extractBareImports,
	getAllDependencies,
	getEntryPointPaths,
	getNonWorkspaceDependencies,
	getPackageNameFromSpecifier,
	getPublicPackages,
	isBareSpecifier,
	validateDistImports,
	validatePackageDependencies,
} from "../validate-package-dependencies";

describe("getAllDependencies()", () => {
	it("should return empty array for undefined", ({ expect }) => {
		expect(getAllDependencies(undefined)).toEqual([]);
	});

	it("should return empty array for empty object", ({ expect }) => {
		expect(getAllDependencies({})).toEqual([]);
	});

	it("should return all dependency names", ({ expect }) => {
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
	it("should return empty array for undefined", ({ expect }) => {
		expect(getNonWorkspaceDependencies(undefined)).toEqual([]);
	});

	it("should return empty array for empty object", ({ expect }) => {
		expect(getNonWorkspaceDependencies({})).toEqual([]);
	});

	it("should filter out workspace dependencies", ({ expect }) => {
		expect(
			getNonWorkspaceDependencies({
				foo: "1.0.0",
				bar: "workspace:*",
				baz: "workspace:^",
				qux: "^2.0.0",
			})
		).toEqual(["foo", "qux"]);
	});

	it("should return all deps if none are workspace deps", ({ expect }) => {
		expect(
			getNonWorkspaceDependencies({
				foo: "1.0.0",
				bar: "^2.0.0",
			})
		).toEqual(["foo", "bar"]);
	});
});

describe("validatePackageDependencies()", () => {
	it("should return no errors for package with no dependencies", ({
		expect,
	}) => {
		const errors = validatePackageDependencies(
			"test-package",
			"test-package",
			{ name: "test-package" },
			null
		);
		expect(errors).toEqual([]);
	});

	it("should return no errors for package with only workspace dependencies", ({
		expect,
	}) => {
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

	it("should return error when package has non-workspace deps but no allowlist", ({
		expect,
	}) => {
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

	it("should return no errors when all deps are in allowlist", ({ expect }) => {
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

	it("should return error for dependency not in allowlist", ({ expect }) => {
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

	it("should return error for stale allowlist entry", ({ expect }) => {
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

	it("should allow workspace deps in EXTERNAL_DEPENDENCIES without error", ({
		expect,
	}) => {
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

	it("should check peerDependencies for stale allowlist entries", ({
		expect,
	}) => {
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

	it("should return multiple errors for multiple issues", ({ expect }) => {
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

	it("should ignore devDependencies completely", ({ expect }) => {
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

	it("should ignore devDependencies when validating against allowlist", ({
		expect,
	}) => {
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

	it("should not require devDependencies to be in allowlist", ({ expect }) => {
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

	it("should not count devDependencies as stale allowlist entries", ({
		expect,
	}) => {
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

describe("getPackageNameFromSpecifier()", () => {
	it("should return the package name from a bare specifier", ({ expect }) => {
		expect(getPackageNameFromSpecifier("lodash")).toBe("lodash");
	});

	it("should strip subpath imports", ({ expect }) => {
		expect(getPackageNameFromSpecifier("lodash/fp")).toBe("lodash");
		expect(getPackageNameFromSpecifier("semver/functions/satisfies.js")).toBe(
			"semver"
		);
	});

	it("should preserve scoped package names", ({ expect }) => {
		expect(getPackageNameFromSpecifier("@cloudflare/workers-utils")).toBe(
			"@cloudflare/workers-utils"
		);
		expect(
			getPackageNameFromSpecifier("@cloudflare/workers-utils/test-helpers")
		).toBe("@cloudflare/workers-utils");
	});
});

describe("isBareSpecifier()", () => {
	it("should accept bare package names", ({ expect }) => {
		expect(isBareSpecifier("lodash")).toBe(true);
		expect(isBareSpecifier("@cloudflare/workers-utils")).toBe(true);
		expect(isBareSpecifier("vitest/runtime")).toBe(true);
	});

	it("should reject relative paths", ({ expect }) => {
		expect(isBareSpecifier("./foo")).toBe(false);
		expect(isBareSpecifier("../bar")).toBe(false);
		expect(isBareSpecifier("/abs/path")).toBe(false);
	});

	it("should reject empty specifiers", ({ expect }) => {
		expect(isBareSpecifier("")).toBe(false);
	});

	it("should reject Node.js built-ins (with and without prefix)", ({
		expect,
	}) => {
		expect(isBareSpecifier("node:fs")).toBe(false);
		expect(isBareSpecifier("fs")).toBe(false);
		expect(isBareSpecifier("node:child_process")).toBe(false);
		expect(isBareSpecifier("child_process")).toBe(false);
		expect(isBareSpecifier("assert")).toBe(false);
	});

	it("should reject Cloudflare/workerd built-ins", ({ expect }) => {
		expect(isBareSpecifier("cloudflare:workers")).toBe(false);
		expect(isBareSpecifier("workerd:unsafe")).toBe(false);
	});

	it("should reject bundler virtual modules", ({ expect }) => {
		expect(isBareSpecifier("virtual:react-router")).toBe(false);
		expect(isBareSpecifier("wrangler:modules-watch")).toBe(false);
	});

	it("should reject ALL_CAPS virtual modules", ({ expect }) => {
		expect(isBareSpecifier("__VITEST_POOL_WORKERS_DEFINES")).toBe(false);
		expect(isBareSpecifier("__BUILD_CONFIG")).toBe(false);
	});

	it("should reject specifiers that are not package-name shaped", ({
		expect,
	}) => {
		expect(isBareSpecifier(",")).toBe(false);
		expect(isBareSpecifier("some random text")).toBe(false);
		expect(isBareSpecifier("ASSERT.IN.MIXED-CASE")).toBe(false);
	});
});

describe("extractBareImports()", () => {
	it("should extract named imports", async ({ expect }) => {
		const imports = await extractBareImports(`import { x } from "lodash";`);
		expect([...imports]).toEqual(["lodash"]);
	});

	it("should extract default imports", async ({ expect }) => {
		const imports = await extractBareImports(`import x from "lodash";`);
		expect([...imports]).toEqual(["lodash"]);
	});

	it("should extract namespace imports", async ({ expect }) => {
		const imports = await extractBareImports(`import * as x from "lodash";`);
		expect([...imports]).toEqual(["lodash"]);
	});

	it("should extract side-effect imports", async ({ expect }) => {
		const imports = await extractBareImports(`import "lodash";`);
		expect([...imports]).toEqual(["lodash"]);
	});

	it("should extract re-exports", async ({ expect }) => {
		const imports = await extractBareImports(`export { x } from "lodash";`);
		expect([...imports]).toEqual(["lodash"]);
	});

	it("should extract require() calls", async ({ expect }) => {
		const imports = await extractBareImports(
			`const x = require("lodash"); require("foo");`
		);
		expect([...imports].sort()).toEqual(["foo", "lodash"]);
	});

	it("should extract dynamic import() calls with string literals", async ({
		expect,
	}) => {
		const imports = await extractBareImports(
			`const x = await import("lodash");`
		);
		expect([...imports]).toEqual(["lodash"]);
	});

	it("should strip subpath imports down to package name", async ({
		expect,
	}) => {
		const imports = await extractBareImports(
			`import x from "semver/functions/satisfies.js";`
		);
		expect([...imports]).toEqual(["semver"]);
	});

	it("should skip relative imports", async ({ expect }) => {
		const imports = await extractBareImports(
			`import x from "./foo"; import y from "../bar";`
		);
		expect([...imports]).toEqual([]);
	});

	it("should skip Node built-in imports", async ({ expect }) => {
		const imports = await extractBareImports(
			`import fs from "node:fs"; const path = require("node:path");`
		);
		expect([...imports]).toEqual([]);
	});

	it("should skip Cloudflare/workerd built-in imports", async ({ expect }) => {
		const imports = await extractBareImports(
			`import { env } from "cloudflare:workers"; import x from "workerd:unsafe";`
		);
		expect([...imports]).toEqual([]);
	});

	it("should skip imports inside line comments", async ({ expect }) => {
		const imports = await extractBareImports(
			`// import x from "lodash";\nimport y from "react";`
		);
		expect([...imports]).toEqual(["react"]);
	});

	it("should skip imports inside block comments", async ({ expect }) => {
		const imports = await extractBareImports(
			`/* import x from "lodash"; */\nimport y from "react";`
		);
		expect([...imports]).toEqual(["react"]);
	});

	it("should skip imports inside template literals (regression: createViteConfig)", async ({
		expect,
	}) => {
		// Regression test: wrangler's createViteConfig bundles the literal text
		// of a vite.config.ts into a template literal. The regex-based scanner
		// used to match `import { defineConfig } from "vite"` as a real import.
		const imports = await extractBareImports(
			[
				"function createViteConfig() {",
				'  const content = `import { cloudflare } from "@cloudflare/vite-plugin";',
				'import { defineConfig } from "vite";',
				"",
				"export default defineConfig({",
				"\tplugins: [cloudflare()],",
				"});",
				"`;",
				"  return content;",
				"}",
				'import real from "react";',
			].join("\n")
		);
		expect([...imports]).toEqual(["react"]);
	});

	it("should skip imports inside single- and double-quoted strings", async ({
		expect,
	}) => {
		const imports = await extractBareImports(
			[
				'const a = "import { x } from \\"lodash\\";";',
				"const b = 'import { y } from \"react\";';",
				'import real from "commander";',
			].join("\n")
		);
		expect([...imports]).toEqual(["commander"]);
	});

	it("should not match `from` keywords that aren't part of import/export", async ({
		expect,
	}) => {
		const imports = await extractBareImports(
			`function foo() { return "hello"; } const z = "from";`
		);
		expect([...imports]).toEqual([]);
	});

	it("should deduplicate imports", async ({ expect }) => {
		const imports = await extractBareImports(
			`import { x } from "lodash";\nimport { y } from "lodash";`
		);
		expect([...imports]).toEqual(["lodash"]);
	});

	it("should handle multiple imports in one file", async ({ expect }) => {
		const imports = await extractBareImports(`
			import { x } from "lodash";
			import y from "react";
			import "polyfill";
			const z = require("commander");
		`);
		expect([...imports].sort()).toEqual([
			"commander",
			"lodash",
			"polyfill",
			"react",
		]);
	});
});

describe("validateDistImports()", () => {
	it("should pass when all imports are declared dependencies", ({ expect }) => {
		const errors = validateDistImports(
			"test-package",
			{
				name: "test-package",
				dependencies: { lodash: "^4.0.0", react: "^18.0.0" },
			},
			new Set(["lodash", "react"])
		);
		expect(errors).toEqual([]);
	});

	it("should pass when imports are peerDependencies", ({ expect }) => {
		const errors = validateDistImports(
			"test-package",
			{
				name: "test-package",
				peerDependencies: { vitest: "^4.0.0" },
			},
			new Set(["vitest"])
		);
		expect(errors).toEqual([]);
	});

	it("should allow self-imports without error", ({ expect }) => {
		const errors = validateDistImports(
			"my-package",
			{ name: "my-package" },
			new Set(["my-package"])
		);
		expect(errors).toEqual([]);
	});

	it("should flag devDependency-only imports with a tailored message", ({
		expect,
	}) => {
		const errors = validateDistImports(
			"test-package",
			{
				name: "test-package",
				devDependencies: { undici: "^7.0.0" },
			},
			new Set(["undici"])
		);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('"undici"');
		expect(errors[0]).toContain("only a devDependency");
		expect(errors[0]).toContain("IGNORED_DIST_IMPORTS");
	});

	it("should flag undeclared imports", ({ expect }) => {
		const errors = validateDistImports(
			"test-package",
			{ name: "test-package" },
			new Set(["mystery-package"])
		);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('"mystery-package"');
		expect(errors[0]).toContain(
			"not declared in dependencies or peerDependencies"
		);
	});

	it("should skip imports in the ignored list", ({ expect }) => {
		const errors = validateDistImports(
			"test-package",
			{
				name: "test-package",
				devDependencies: { "@netlify/build-info": "^1.0.0" },
			},
			new Set(["react-router", "@angular/ssr"]),
			["react-router", "@angular/ssr"]
		);
		expect(errors).toEqual([]);
	});

	it("should still flag non-ignored imports when ignored list is non-empty", ({
		expect,
	}) => {
		const errors = validateDistImports(
			"test-package",
			{
				name: "test-package",
				devDependencies: { undici: "^7.0.0" },
			},
			new Set(["undici", "react-router"]),
			["react-router"]
		);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('"undici"');
	});
});

describe("getEntryPointPaths()", () => {
	it("should collect main field", ({ expect }) => {
		const paths = getEntryPointPaths({
			name: "p",
			main: "dist/index.js",
		});
		expect(paths).toEqual(["dist/index.js"]);
	});

	it("should collect module field", ({ expect }) => {
		const paths = getEntryPointPaths({
			name: "p",
			module: "dist/index.mjs",
		});
		expect(paths).toEqual(["dist/index.mjs"]);
	});

	it("should walk nested exports object", ({ expect }) => {
		const paths = getEntryPointPaths({
			name: "p",
			exports: {
				".": {
					import: "./dist/index.mjs",
					require: "./dist/index.cjs",
					types: "./dist/index.d.ts",
				},
				"./test-helpers": {
					import: "./dist/test-helpers/index.mjs",
				},
			},
		});
		expect(paths.sort()).toEqual([
			"./dist/index.cjs",
			"./dist/index.d.ts",
			"./dist/index.mjs",
			"./dist/test-helpers/index.mjs",
		]);
	});

	it("should collect string bin entries", ({ expect }) => {
		const paths = getEntryPointPaths({
			name: "p",
			bin: "./bin/cli.js",
		});
		expect(paths).toEqual(["./bin/cli.js"]);
	});

	it("should collect object bin entries", ({ expect }) => {
		const paths = getEntryPointPaths({
			name: "p",
			bin: { foo: "./bin/foo.js", bar: "./bin/bar.js" },
		});
		expect(paths.sort()).toEqual(["./bin/bar.js", "./bin/foo.js"]);
	});

	it("should deduplicate paths across fields", ({ expect }) => {
		const paths = getEntryPointPaths({
			name: "p",
			main: "./dist/index.js",
			module: "./dist/index.js",
			exports: { ".": "./dist/index.js" },
		});
		expect(paths).toEqual(["./dist/index.js"]);
	});

	it("should return empty array when no entry points are declared", ({
		expect,
	}) => {
		const paths = getEntryPointPaths({ name: "p" });
		expect(paths).toEqual([]);
	});
});

describe("getPublicPackages()", () => {
	it("should return only non-private packages", async ({ expect }) => {
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

	it("should not include private packages", async ({ expect }) => {
		const packages = await getPublicPackages();
		const packageNames = packages.map((p) => p.packageJson.name);

		// These are known private packages
		expect(packageNames).not.toContain("@cloudflare/workers-shared");
	});
});

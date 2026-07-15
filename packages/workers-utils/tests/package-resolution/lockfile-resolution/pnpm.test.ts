import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "vitest";
import { runInTempDir } from "../../../src/test-helpers";
import { resolveFromLockFile } from "./share";

describe("lockfile resolution — pnpm pnpm-lock.yaml", () => {
	runInTempDir();

	it("parses v9 lockfile for the root importer", ({ expect }) => {
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
				"    devDependencies:",
				"      typescript:",
				"        specifier: ^5.3.0",
				"        version: 5.8.3",
			].join("\n")
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.get("lodash")).toBe("4.17.21");
		expect(versions.get("typescript")).toBe("5.8.3");
	});

	it("parses v6 lockfile", ({ expect }) => {
		fs.writeFileSync(
			"pnpm-lock.yaml",
			[
				"lockfileVersion: '6.0'",
				"",
				"importers:",
				"  .:",
				"    dependencies:",
				"      express:",
				"        specifier: ^4.18.2",
				"        version: 4.18.2",
			].join("\n")
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.get("express")).toBe("4.18.2");
	});

	it("strips peer dependency suffixes", ({ expect }) => {
		fs.writeFileSync(
			"pnpm-lock.yaml",
			[
				"lockfileVersion: '9.0'",
				"",
				"importers:",
				"  .:",
				"    dependencies:",
				"      vitest:",
				"        specifier: ^4.1.0",
				"        version: 4.1.0(@types/node@22.15.17)(esbuild@0.28.1)",
				"      simple-pkg:",
				"        specifier: ^1.0.0",
				"        version: 1.0.0",
			].join("\n")
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.get("vitest")).toBe("4.1.0");
		expect(versions.get("simple-pkg")).toBe("1.0.0");
	});

	it("skips npm aliases", ({ expect }) => {
		fs.writeFileSync(
			"pnpm-lock.yaml",
			[
				"lockfileVersion: '9.0'",
				"",
				"importers:",
				"  .:",
				"    devDependencies:",
				"      node-types-alias:",
				"        specifier: 'npm:@types/node@^22.14.0'",
				"        version: '@types/node@22.15.17'",
				"      real-pkg:",
				"        specifier: ^1.0.0",
				"        version: 1.0.0",
			].join("\n")
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.has("node-types-alias")).toBe(false);
		expect(versions.get("real-pkg")).toBe("1.0.0");
	});

	it("skips link: and file: entries", ({ expect }) => {
		fs.writeFileSync(
			"pnpm-lock.yaml",
			[
				"lockfileVersion: '9.0'",
				"",
				"importers:",
				"  .:",
				"    dependencies:",
				"      my-lib:",
				"        specifier: workspace:*",
				"        version: link:../my-lib",
				"      local-pkg:",
				"        specifier: file:../local-pkg",
				"        version: 'file:../local-pkg'",
				"      real-pkg:",
				"        specifier: ^1.0.0",
				"        version: 1.0.0",
			].join("\n")
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.has("my-lib")).toBe(false);
		expect(versions.has("local-pkg")).toBe(false);
		expect(versions.get("real-pkg")).toBe("1.0.0");
	});

	it("resolves a sub-package importer in a monorepo", ({ expect }) => {
		// Lockfile is at the monorepo root
		const subPkgDir = path.join(process.cwd(), "packages", "my-app");
		fs.mkdirSync(subPkgDir, { recursive: true });

		fs.writeFileSync(
			"pnpm-lock.yaml",
			[
				"lockfileVersion: '9.0'",
				"",
				"importers:",
				"  .:",
				"    dependencies:",
				"      root-only-dep:",
				"        specifier: ^1.0.0",
				"        version: 1.0.0",
				"  packages/my-app:",
				"    dependencies:",
				"      sub-pkg-dep:",
				"        specifier: ^2.0.0",
				"        version: 2.5.0",
			].join("\n")
		);

		const versions = resolveFromLockFile(subPkgDir);
		assert(versions);
		expect(versions.get("sub-pkg-dep")).toBe("2.5.0");
		expect(versions.has("root-only-dep")).toBe(false);
	});

	it("merges dependencies and devDependencies", ({ expect }) => {
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
				"    devDependencies:",
				"      typescript:",
				"        specifier: ^5.3.0",
				"        version: 5.8.3",
				"      vitest:",
				"        specifier: ^4.1.0",
				"        version: 4.1.0",
			].join("\n")
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.get("lodash")).toBe("4.17.21");
		expect(versions.get("typescript")).toBe("5.8.3");
		expect(versions.get("vitest")).toBe("4.1.0");
	});

	it("returns an empty map for a missing importer key", ({ expect }) => {
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

		// Request an importer that doesn't exist
		const subDir = path.join(process.cwd(), "packages", "nonexistent");
		fs.mkdirSync(subDir, { recursive: true });
		const versions = resolveFromLockFile(subDir);
		assert(versions);
		expect(versions.size).toBe(0);
	});

	it("parses v5 single-project lockfile (no importers)", ({ expect }) => {
		fs.writeFileSync(
			"pnpm-lock.yaml",
			[
				"lockfileVersion: 5.4",
				"",
				"specifiers:",
				"  lodash: ^4.17.21",
				"  typescript: ^4.9.0",
				"",
				"dependencies:",
				"  lodash: 4.17.21",
				"",
				"devDependencies:",
				"  typescript: 4.9.5",
			].join("\n")
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.get("lodash")).toBe("4.17.21");
		expect(versions.get("typescript")).toBe("4.9.5");
	});

	it("strips v5 underscore peer-dependency suffixes", ({ expect }) => {
		fs.writeFileSync(
			"pnpm-lock.yaml",
			[
				"lockfileVersion: 5.4",
				"",
				"specifiers:",
				"  react-dom: ^16.8.0",
				"",
				"dependencies:",
				"  react-dom: 16.14.0_react@16.14.0",
			].join("\n")
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.get("react-dom")).toBe("16.14.0");
	});

	it("skips npm: aliases in v5 via specifiers map", ({ expect }) => {
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

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		// node-types is an alias → skipped via specifiers check
		expect(versions.has("node-types")).toBe(false);
		expect(versions.get("lodash")).toBe("4.17.21");
	});

	it("skips link: and file: entries in v5", ({ expect }) => {
		fs.writeFileSync(
			"pnpm-lock.yaml",
			[
				"lockfileVersion: 5.4",
				"",
				"specifiers:",
				"  my-lib: workspace:*",
				"  lodash: ^4.17.21",
				"",
				"dependencies:",
				"  my-lib: link:../my-lib",
				"  lodash: 4.17.21",
			].join("\n")
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.has("my-lib")).toBe(false);
		expect(versions.get("lodash")).toBe("4.17.21");
	});

	it("skips path-form entries (e.g. /pkg/version) in v5", ({ expect }) => {
		fs.writeFileSync(
			"pnpm-lock.yaml",
			[
				"lockfileVersion: 5.4",
				"",
				"specifiers:",
				"  react: ^16.8.0",
				"  lodash: ^4.17.21",
				"",
				"dependencies:",
				"  react: /react/16.14.0",
				"  lodash: 4.17.21",
			].join("\n")
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		// path-form entries are skipped
		expect(versions.has("react")).toBe(false);
		expect(versions.get("lodash")).toBe("4.17.21");
	});

	it("v5 fallback only applies to root importer", ({ expect }) => {
		// v5 top-level deps should only be used when importerKey is "."
		const subDir = path.join(process.cwd(), "packages", "sub");
		fs.mkdirSync(subDir, { recursive: true });

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

		// Requesting from a sub-package should not match v5 top-level deps
		const versions = resolveFromLockFile(subDir);
		assert(versions);
		expect(versions.size).toBe(0);
	});
});

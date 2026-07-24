import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "vitest";
import {
	createLockfileCache,
	getInstalledVersionsFromLockfile,
} from "../../../src/package-resolution/lockfiles-resolution";
import { runInTempDir } from "../../../src/test-helpers";
import { resolveFromLockFile } from "./share";

describe("lockfile resolution — generic", () => {
	runInTempDir();

	it("returns undefined when no lockfile exists", ({ expect }) => {
		const result = resolveFromLockFile(process.cwd());
		expect(result).toBeUndefined();
	});

	// -----------------------------------------------------------------------
	// Lockfile discovery (walking up directories)
	// -----------------------------------------------------------------------

	describe("lockfile discovery", () => {
		it("walks up to find a lockfile in a parent directory", ({ expect }) => {
			fs.writeFileSync(
				"package-lock.json",
				JSON.stringify({
					lockfileVersion: 3,
					packages: {
						"": { name: "root", version: "1.0.0" },
						"node_modules/lodash": { version: "4.17.21" },
					},
				})
			);

			const subDir = path.join(process.cwd(), "packages", "my-app");
			fs.mkdirSync(subDir, { recursive: true });

			const versions = resolveFromLockFile(subDir);
			assert(versions);
			expect(versions.get("lodash")).toBe("4.17.21");
		});
	});

	// -----------------------------------------------------------------------
	// Lockfile priority
	// -----------------------------------------------------------------------

	describe("lockfile priority", () => {
		it("prefers pnpm-lock.yaml over package-lock.json in the same directory", ({
			expect,
		}) => {
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
			fs.writeFileSync(
				"package-lock.json",
				JSON.stringify({
					lockfileVersion: 3,
					packages: {
						"": { name: "test", version: "1.0.0" },
						"node_modules/lodash": { version: "4.17.20" },
					},
				})
			);

			const versions = resolveFromLockFile(process.cwd());
			assert(versions);
			// pnpm-lock.yaml comes first in LOCKFILE_NAMES
			expect(versions.get("lodash")).toBe("4.17.21");
		});

		it("prefers a nearer lockfile over a higher-priority one in an ancestor", ({
			expect,
		}) => {
			// Root has a pnpm-lock.yaml (higher priority name)
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

			// Sub-project has a package-lock.json (lower priority name, but nearer)
			const subDir = path.join(process.cwd(), "sub-project");
			fs.mkdirSync(subDir, { recursive: true });
			fs.writeFileSync(
				path.join(subDir, "package-lock.json"),
				JSON.stringify({
					lockfileVersion: 3,
					packages: {
						"": { name: "sub", version: "1.0.0" },
						"node_modules/express": { version: "4.18.2" },
					},
				})
			);

			const versions = resolveFromLockFile(subDir);
			assert(versions);
			// The nearer package-lock.json should win over the ancestor pnpm-lock.yaml
			expect(versions.get("express")).toBe("4.18.2");
			expect(versions.has("lodash")).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	// Error handling
	// -----------------------------------------------------------------------

	describe("error handling", () => {
		it("returns undefined when only bun.lockb (binary) is present", ({
			expect,
		}) => {
			// bun.lockb is a binary lockfile and cannot be parsed — it is
			// intentionally excluded from LOCKFILE_NAMES
			fs.writeFileSync("bun.lockb", Buffer.from([0x00, 0x01, 0x02]));

			const versions = resolveFromLockFile(process.cwd());
			expect(versions).toBeUndefined();
		});

		it("returns undefined for a malformed pnpm-lock.yaml", ({ expect }) => {
			fs.writeFileSync(
				"pnpm-lock.yaml",
				"this: is: not: [valid yaml: because: {{"
			);

			const versions = resolveFromLockFile(process.cwd());
			expect(versions).toBeUndefined();
		});
	});

	// -----------------------------------------------------------------------
	// Memoization
	// -----------------------------------------------------------------------

	describe("memoization", () => {
		it("returns the same map instance for repeated calls with a shared cache", ({
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

			const cache = createLockfileCache();
			const first = getInstalledVersionsFromLockfile(process.cwd(), {
				cache,
			});
			const second = getInstalledVersionsFromLockfile(process.cwd(), {
				cache,
			});
			expect(first).toBe(second);
		});

		it("re-parses when no cache is provided", ({ expect }) => {
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

			const first = getInstalledVersionsFromLockfile(process.cwd());
			const second = getInstalledVersionsFromLockfile(process.cwd());
			// Without a cache, each call returns a fresh map instance
			expect(first).not.toBe(second);
			// But the contents are equivalent
			expect(first).toEqual(second);
		});

		it("returns distinct results for different projectPaths in a pnpm monorepo", ({
			expect,
		}) => {
			// Simulate a pnpm monorepo with two workspace packages that have
			// different dependency sets under the same lockfile.
			fs.writeFileSync(
				"pnpm-lock.yaml",
				[
					"lockfileVersion: '9.0'",
					"",
					"importers:",
					"  packages/app-a:",
					"    dependencies:",
					"      lodash:",
					"        specifier: ^4.17.21",
					"        version: 4.17.21",
					"  packages/app-b:",
					"    dependencies:",
					"      express:",
					"        specifier: ^4.18.0",
					"        version: 4.18.2",
				].join("\n")
			);

			const appADir = path.join(process.cwd(), "packages", "app-a");
			const appBDir = path.join(process.cwd(), "packages", "app-b");
			fs.mkdirSync(appADir, { recursive: true });
			fs.mkdirSync(appBDir, { recursive: true });

			const cache = createLockfileCache();
			const versionsA = getInstalledVersionsFromLockfile(appADir, {
				cache,
			});
			const versionsB = getInstalledVersionsFromLockfile(appBDir, {
				cache,
			});

			assert(versionsA);
			assert(versionsB);

			// app-a should see lodash, not express
			expect(versionsA.get("lodash")).toBe("4.17.21");
			expect(versionsA.has("express")).toBe(false);

			// app-b should see express, not lodash
			expect(versionsB.get("express")).toBe("4.18.2");
			expect(versionsB.has("lodash")).toBe(false);

			// The two maps must be distinct objects
			expect(versionsA).not.toBe(versionsB);
		});
	});
});

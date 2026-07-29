import assert from "node:assert";
import * as fs from "node:fs";
import { describe, it } from "vitest";
import { runInTempDir } from "../../../src/test-helpers";
import { resolveFromLockFile } from "./share";

describe("lockfile resolution — bun.lock", () => {
	runInTempDir();

	it("parses JSONC format", ({ expect }) => {
		fs.writeFileSync(
			"bun.lock",
			JSON.stringify({
				lockfileVersion: 0,
				workspaces: {
					"": {
						name: "test-project",
						dependencies: { lodash: "^4.17.21" },
					},
				},
				packages: {
					lodash: ["lodash@4.17.21", {}],
					express: ["express@4.18.2", {}],
				},
			})
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.get("lodash")).toBe("4.17.21");
		expect(versions.get("express")).toBe("4.18.2");
	});

	it("handles scoped packages", ({ expect }) => {
		fs.writeFileSync(
			"bun.lock",
			JSON.stringify({
				lockfileVersion: 0,
				packages: {
					"@types/node": ["@types/node@22.15.17", {}],
				},
			})
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.get("@types/node")).toBe("22.15.17");
	});

	it("skips aliases (key differs from resolved name)", ({ expect }) => {
		fs.writeFileSync(
			"bun.lock",
			JSON.stringify({
				lockfileVersion: 0,
				packages: {
					ts552: ["typescript@5.5.2", {}],
					lodash: ["lodash@4.17.21", {}],
				},
			})
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.has("ts552")).toBe(false);
		expect(versions.get("lodash")).toBe("4.17.21");
	});

	it("handles JSONC with trailing commas", ({ expect }) => {
		// bun.lock is JSONC which may have trailing commas
		fs.writeFileSync(
			"bun.lock",
			`{
				"lockfileVersion": 0,
				"packages": {
					"lodash": ["lodash@4.17.21", {},],
				},
			}`
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.get("lodash")).toBe("4.17.21");
	});

	it("skips non-array and empty-array entries", ({ expect }) => {
		fs.writeFileSync(
			"bun.lock",
			JSON.stringify({
				lockfileVersion: 0,
				packages: {
					"bad-string": "not-an-array",
					"bad-empty": [],
					lodash: ["lodash@4.17.21", {}],
				},
			})
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.has("bad-string")).toBe(false);
		expect(versions.has("bad-empty")).toBe(false);
		expect(versions.get("lodash")).toBe("4.17.21");
	});

	it("skips entries with non-string first element", ({ expect }) => {
		fs.writeFileSync(
			"bun.lock",
			JSON.stringify({
				lockfileVersion: 0,
				packages: {
					"bad-number": [42, {}],
					lodash: ["lodash@4.17.21", {}],
				},
			})
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.has("bad-number")).toBe(false);
		expect(versions.get("lodash")).toBe("4.17.21");
	});

	it("skips entries without a parseable version", ({ expect }) => {
		fs.writeFileSync(
			"bun.lock",
			JSON.stringify({
				lockfileVersion: 0,
				packages: {
					"no-at-sign": ["justastring", {}],
					lodash: ["lodash@4.17.21", {}],
				},
			})
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.has("no-at-sign")).toBe(false);
		expect(versions.get("lodash")).toBe("4.17.21");
	});

	it("returns an empty map when packages key is missing", ({ expect }) => {
		fs.writeFileSync(
			"bun.lock",
			JSON.stringify({
				lockfileVersion: 0,
			})
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.size).toBe(0);
	});
});

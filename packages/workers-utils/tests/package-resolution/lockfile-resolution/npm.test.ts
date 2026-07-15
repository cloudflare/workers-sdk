import assert from "node:assert";
import * as fs from "node:fs";
import { describe, it } from "vitest";
import { runInTempDir } from "../../../src/test-helpers";
import { resolveFromLockFile } from "./share";

describe("lockfile resolution — npm package-lock.json", () => {
	runInTempDir();

	it("parses lockfileVersion 3 (v2/v3 format)", ({ expect }) => {
		fs.writeFileSync(
			"package-lock.json",
			JSON.stringify({
				name: "test-project",
				version: "1.0.0",
				lockfileVersion: 3,
				packages: {
					"": {
						name: "test-project",
						version: "1.0.0",
						dependencies: { lodash: "^4.17.21" },
					},
					"node_modules/lodash": {
						version: "4.17.21",
						resolved: "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",
					},
					"node_modules/express": {
						version: "4.18.2",
						resolved: "https://registry.npmjs.org/express/-/express-4.18.2.tgz",
					},
				},
			})
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.get("lodash")).toBe("4.17.21");
		expect(versions.get("express")).toBe("4.18.2");
	});

	it("parses lockfileVersion 1 format", ({ expect }) => {
		fs.writeFileSync(
			"package-lock.json",
			JSON.stringify({
				name: "test-project",
				version: "1.0.0",
				lockfileVersion: 1,
				dependencies: {
					lodash: {
						version: "4.17.21",
						resolved: "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",
					},
				},
			})
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.get("lodash")).toBe("4.17.21");
	});

	it("skips nested node_modules entries (transitive deps)", ({ expect }) => {
		fs.writeFileSync(
			"package-lock.json",
			JSON.stringify({
				lockfileVersion: 3,
				packages: {
					"": { name: "test", version: "1.0.0" },
					"node_modules/foo": { version: "1.0.0" },
					"node_modules/foo/node_modules/bar": { version: "2.0.0" },
				},
			})
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.get("foo")).toBe("1.0.0");
		expect(versions.has("bar")).toBe(false);
	});

	it("skips npm aliases in v2/v3 format", ({ expect }) => {
		fs.writeFileSync(
			"package-lock.json",
			JSON.stringify({
				lockfileVersion: 3,
				packages: {
					"": { name: "test", version: "1.0.0" },
					"node_modules/my-react": {
						name: "react",
						version: "18.2.0",
					},
					"node_modules/lodash": {
						version: "4.17.21",
					},
				},
			})
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.has("my-react")).toBe(false);
		expect(versions.get("lodash")).toBe("4.17.21");
	});

	it("skips npm aliases in v1 format", ({ expect }) => {
		fs.writeFileSync(
			"package-lock.json",
			JSON.stringify({
				lockfileVersion: 1,
				dependencies: {
					"my-react": {
						version: "npm:react@18.2.0",
					},
					lodash: {
						version: "4.17.21",
					},
				},
			})
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.has("my-react")).toBe(false);
		expect(versions.get("lodash")).toBe("4.17.21");
	});

	it("handles scoped packages", ({ expect }) => {
		fs.writeFileSync(
			"package-lock.json",
			JSON.stringify({
				lockfileVersion: 3,
				packages: {
					"": { name: "test", version: "1.0.0" },
					"node_modules/@types/node": {
						version: "22.15.17",
					},
					"node_modules/@cloudflare/workers-types": {
						version: "5.20260710.1",
					},
				},
			})
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		expect(versions.get("@types/node")).toBe("22.15.17");
		expect(versions.get("@cloudflare/workers-types")).toBe("5.20260710.1");
	});

	it("prefers packages over dependencies in lockfileVersion 2", ({
		expect,
	}) => {
		// lockfileVersion 2 has both `packages` (new format) and `dependencies`
		// (legacy fallback). The parser should use `packages` and ignore the
		// legacy section, and should not emit the root `""` entry.
		fs.writeFileSync(
			"package-lock.json",
			JSON.stringify({
				name: "test-project",
				version: "1.0.0",
				lockfileVersion: 2,
				packages: {
					"": {
						name: "test-project",
						version: "1.0.0",
						dependencies: { lodash: "^4.17.21" },
					},
					"node_modules/lodash": {
						version: "4.17.21",
					},
				},
				dependencies: {
					lodash: {
						version: "4.17.20",
					},
				},
			})
		);

		const versions = resolveFromLockFile(process.cwd());
		assert(versions);
		// packages wins over legacy dependencies
		expect(versions.get("lodash")).toBe("4.17.21");
		// root entry "" is not emitted as a package
		expect(versions.has("")).toBe(false);
		expect(versions.has("test-project")).toBe(false);
	});

	it("returns undefined for malformed JSON", ({ expect }) => {
		fs.writeFileSync("package-lock.json", "{ this is not valid json !!!");

		const versions = resolveFromLockFile(process.cwd());
		expect(versions).toBeUndefined();
	});
});

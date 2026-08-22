import * as fs from "node:fs";
import * as path from "node:path";
import { getWorkerBundleDir } from "@cloudflare/build-output-utils";
import { describe, test } from "vitest";
import { getJsonResponse, isBuild, rootDir } from "../../../__test-utils__";

describe.runIf(isBuild)("output directories", () => {
	test("creates the correct output directories", ({ expect }) => {
		expect(fs.existsSync(getWorkerBundleDir(rootDir))).toBe(true);
		expect(fs.existsSync(getWorkerBundleDir(rootDir, "auxiliary-worker"))).toBe(
			true
		);
		expect(
			fs.existsSync(path.join(rootDir, "custom-worker-output-directory"))
		).toBe(false);
	});
});

describe("multi-worker service bindings", async () => {
	test("returns a response from another worker", async ({ expect }) => {
		const result = await getJsonResponse("/fetch");
		expect(result).toEqual({ result: { name: "Worker B" } });
	});
});

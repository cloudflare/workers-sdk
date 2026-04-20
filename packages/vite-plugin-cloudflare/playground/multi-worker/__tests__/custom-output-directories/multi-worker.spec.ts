import * as fs from "node:fs";
import * as path from "node:path";
import { describe, test } from "vitest";
import { getJsonResponse, isBuild, rootDir } from "../../../__test-utils__";

describe.runIf(isBuild)("output directories", () => {
	test("creates the correct output directories", ({ expect }) => {
		expect(
			fs.existsSync(
				path.join(rootDir, "custom-root-output-directory", "worker_a")
			)
		).toBe(true);
		expect(
			fs.existsSync(path.join(rootDir, "custom-worker-output-directory"))
		).toBe(true);
	});
});

describe("multi-worker service bindings", async () => {
	test("returns a response from another worker", async ({ expect }) => {
		const result = await getJsonResponse("/fetch");
		expect(result).toEqual({ result: { name: "Worker B" } });
	});
});

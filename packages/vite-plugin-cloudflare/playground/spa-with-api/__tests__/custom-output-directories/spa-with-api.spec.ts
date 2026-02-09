import * as fs from "node:fs";
import * as path from "node:path";
import { describe, test, vi } from "vitest";
import { isBuild, rootDir, WAIT_FOR_OPTIONS } from "../../../__test-utils__";
import "../base-tests";

describe.runIf(isBuild)("output directories", () => {
	test("creates the correct output directories", async ({ expect }) => {
		await vi.waitFor(() => {
			expect(
				fs.existsSync(
					path.join(rootDir, "custom-root-output-directory", "worker")
				)
			).toBe(true);
			expect(
				fs.existsSync(path.join(rootDir, "custom-client-output-directory"))
			).toBe(true);
		}, WAIT_FOR_OPTIONS);
	});
});

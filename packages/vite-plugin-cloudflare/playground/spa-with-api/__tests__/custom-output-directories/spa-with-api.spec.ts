import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { isBuild, rootDir } from "../../../__test-utils__";
import "../base-tests";

describe.runIf(isBuild)("output directories", () => {
	test("creates the correct output directories", () => {
		expect(
			fs.existsSync(path.join(rootDir, "custom-root-output-directory", "api"))
		).toBe(true);
		expect(
			fs.existsSync(path.join(rootDir, "custom-client-output-directory"))
		).toBe(true);
	});
});

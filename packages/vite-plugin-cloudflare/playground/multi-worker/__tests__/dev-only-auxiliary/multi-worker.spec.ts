import * as fs from "node:fs";
import { getWorkerBundleDir } from "@cloudflare/build-output-utils";
import { describe, test } from "vitest";
import { isBuild, rootDir } from "../../../__test-utils__";

describe.runIf(isBuild)("dev-only auxiliary Worker", () => {
	test("creates output directory for entry worker only", ({ expect }) => {
		expect(fs.existsSync(getWorkerBundleDir(rootDir))).toBe(true);
		expect(fs.existsSync(getWorkerBundleDir(rootDir, "auxiliary-worker"))).toBe(
			false
		);
	});
});

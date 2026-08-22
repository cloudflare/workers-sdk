import * as fs from "node:fs";
import * as path from "node:path";
import { describe, test } from "vitest";
import { isBuild, rootDir } from "../../../__test-utils__";

describe.runIf(isBuild)("dev-only auxiliary Worker", () => {
	// TODO: Reinstate when auxiliary Workers are supported by Build Output.
	test.skip("creates output directory for entry worker only", ({ expect }) => {
		expect(
			fs.existsSync(
				path.join(
					rootDir,
					".cloudflare",
					"output",
					"v0",
					"workers",
					"default",
					"bundle"
				)
			)
		).toBe(true);
		expect(
			fs.existsSync(path.join(rootDir, "custom-dev-only-directory", "worker_b"))
		).toBe(false);
	});
});

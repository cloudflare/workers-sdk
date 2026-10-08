import * as fs from "node:fs";
import * as path from "node:path";
import { test, describe } from "vitest";
import {
	isBuild,
	satisfiesMinimumViteVersion,
	testDir,
} from "../../../__test-utils__";

describe.runIf(satisfiesMinimumViteVersion("7.0.0"))(
	"assets-only Wrangler config",
	() => {
		test.runIf(isBuild)(
			"keeps using declarations in the prerender Worker build",
			async ({ expect }) => {
				const output = fs.readFileSync(
					path.join(testDir, "dist", "prerender", "index.js"),
					"utf-8"
				);
				expect(output).toMatch(/\busing [\w$]+ =/);
				expect(output).not.toMatch(/__using|_usingCtx/);
			}
		);
	}
);

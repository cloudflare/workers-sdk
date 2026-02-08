import * as fs from "node:fs";
import * as path from "node:path";
import { expect, test } from "vitest";
import { isBuild, rootDir } from "../../../__test-utils__";

test.runIf(isBuild)(
	"sets `upload_source_maps` to `true` when `build.sourcemap` is enabled",
	() => {
		const wranglerConfig = JSON.parse(
			fs.readFileSync(
				path.join(rootDir, "dist", "worker", "wrangler.json"),
				"utf-8"
			)
		);
		expect(wranglerConfig.upload_source_maps).toBe(true);
	}
);

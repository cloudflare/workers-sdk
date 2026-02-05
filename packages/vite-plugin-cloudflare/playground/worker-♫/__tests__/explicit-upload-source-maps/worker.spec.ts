import * as fs from "node:fs";
import * as path from "node:path";
import { expect, test } from "vitest";
import { isBuild, rootDir } from "../../../__test-utils__";

test.runIf(isBuild)(
	"respects explicit `upload_source_maps` value in Worker config",
	() => {
		const wranglerConfig = JSON.parse(
			fs.readFileSync(
				path.join(rootDir, "dist", "worker", "wrangler.json"),
				"utf-8"
			)
		);
		expect(wranglerConfig.upload_source_maps).toBe(false);
	}
);

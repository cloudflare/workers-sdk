import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "vitest";
import { isBuild, rootDir } from "../../../__test-utils__";

test.runIf(isBuild)(
	"does not set `upload_source_maps` when `build.sourcemap` is disabled",
	({ expect }) => {
		const wranglerConfig = JSON.parse(
			fs.readFileSync(
				path.join(rootDir, "dist", "worker", "wrangler.json"),
				"utf-8"
			)
		);
		expect(wranglerConfig.upload_source_maps).toBeUndefined();
	}
);

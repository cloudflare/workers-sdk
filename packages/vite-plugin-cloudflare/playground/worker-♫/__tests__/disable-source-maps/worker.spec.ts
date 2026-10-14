import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "vitest";
import { isBuild, rootDir } from "../../../__test-utils__";

test.runIf(isBuild)(
	"does not emit source maps when `build.sourcemap` is disabled",
	({ expect }) => {
		const outputDir = path.join(
			rootDir,
			".cloudflare/output/v0/workers/default"
		);
		const config = JSON.parse(
			fs.readFileSync(path.join(outputDir, "worker.config.json"), "utf-8")
		) as { manifest: { mainModule: string } };
		expect(
			fs.existsSync(
				path.join(outputDir, "bundle", `${config.manifest.mainModule}.map`)
			)
		).toBe(false);
	}
);

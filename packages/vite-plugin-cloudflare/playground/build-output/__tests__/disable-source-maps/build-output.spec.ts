import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "vitest";
import { isBuild, rootDir } from "../../../__test-utils__";

test.runIf(isBuild)(
	"does not emit source maps when `build.sourcemap` is disabled",
	({ expect }) => {
		const workerDir = path.join(
			rootDir,
			".cloudflare/output/v0/workers/default"
		);
		const config = JSON.parse(
			fs.readFileSync(path.join(workerDir, "worker.config.json"), "utf-8")
		) as { manifest: { mainModule: string } };
		const sourceMapPath = path.join(
			workerDir,
			"bundle",
			`${config.manifest.mainModule}.map`
		);

		expect(fs.existsSync(sourceMapPath)).toBe(false);
	}
);

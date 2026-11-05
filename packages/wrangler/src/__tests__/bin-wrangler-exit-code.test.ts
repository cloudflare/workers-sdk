import { spawnSync } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";

describe("bin/wrangler.js", () => {
	runInTempDir();

	it.skipIf(process.platform === "win32")(
		"reports failure when the Wrangler CLI is killed by a signal",
		async ({ expect }) => {
			await mkdir("bin", { recursive: true });
			await mkdir("wrangler-dist", { recursive: true });
			await copyFile(
				path.resolve(import.meta.dirname, "../../bin/wrangler.js"),
				"bin/wrangler.js"
			);
			await writeFile(
				"wrangler-dist/cli.js",
				'process.kill(process.pid, "SIGKILL");'
			);

			const result = spawnSync(process.execPath, ["bin/wrangler.js"], {
				encoding: "utf8",
			});

			expect(result.status).toBe(1);
			expect(result.signal).toBeNull();
			expect(result.stderr).toContain(
				"wrangler exited because it received signal SIGKILL"
			);
		}
	);
});

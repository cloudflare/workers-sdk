import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fetch } from "undici";
import { describe, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

/**
 * Writes a build output directory the way a framework adapter such as
 * `@cloudflare/next-on-pages` does: static assets alongside a
 * `_worker.js/` directory.
 */
function writeBuildOutput(outputDir: string, message: string) {
	mkdirSync(join(outputDir, "_worker.js"), { recursive: true });
	writeFileSync(join(outputDir, "index.html"), "<h1>static</h1>");
	writeFileSync(
		join(outputDir, "_worker.js", "index.js"),
		`export default {
	async fetch() {
		return new Response(${JSON.stringify(message)});
	},
};
`
	);
}

describe("Pages _worker.js/ directory rebuilds", () => {
	// https://github.com/cloudflare/workers-sdk/issues/3696
	it("should keep running while a build deletes and re-creates the _worker.js/ directory", async ({
		expect,
	}) => {
		const projectDir = realpathSync(
			mkdtempSync(join(tmpdir(), "pages-workerjs-directory-rebuild-"))
		);
		const outputDir = join(projectDir, "public");
		writeBuildOutput(outputDir, "first build");

		const { ip, port, getOutput, stop } = await runWranglerPagesDev(
			projectDir,
			"public",
			["--port=0", "--inspector-port=0", "--compatibility-date=2025-07-15"]
		);
		try {
			await expect(
				fetch(`http://${ip}:${port}/`).then((resp) => resp.text())
			).resolves.toBe("first build");

			// Like `next-on-pages --watch`, the build clears its whole output
			// directory before it writes the new one.
			rmSync(outputDir, { recursive: true, force: true });
			await setTimeout(1_000);

			// The missing `_worker.js/` directory must not crash `pages dev`...
			expect(getOutput()).not.toMatch(
				/ENOENT: no such file or directory, scandir '.*_worker\.js'/
			);
			// ...which should keep serving the last Worker it built
			await expect(
				fetch(`http://${ip}:${port}/`).then((resp) => resp.text())
			).resolves.toBe("first build");

			// and still be running once the build has written its new output
			writeBuildOutput(outputDir, "second build");
			await setTimeout(1_000);
			await expect(
				fetch(`http://${ip}:${port}/`).then((resp) => resp.status)
			).resolves.toBe(200);
		} finally {
			await stop();
			rmSync(projectDir, { recursive: true, force: true });
		}
	});
});

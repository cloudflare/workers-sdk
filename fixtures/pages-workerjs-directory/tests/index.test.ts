import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join, resolve } from "node:path";
import { fetch } from "undici";
import { describe, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe.concurrent("Pages _worker.js/ directory", () => {
	it("should support non-bundling with 'dev'", async ({ expect }) => {
		const { ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"public",
			["--port=0"]
		);
		await expect(
			fetch(`http://${ip}:${port}/`).then((resp) => resp.text())
		).resolves.toContain("Hello, world!");
		await expect(
			fetch(`http://${ip}:${port}/wasm`).then((resp) => resp.text())
		).resolves.toContain("3");
		await expect(
			fetch(`http://${ip}:${port}/static`).then((resp) => resp.text())
		).resolves.toContain("static");
		await expect(
			fetch(`http://${ip}:${port}/other-script`).then((resp) => resp.text())
		).resolves.toContain("test");
		await stop();
	});

	it("should bundle", async ({ expect }) => {
		const dir = tmpdir();
		const file = join(dir, "./_worker.bundle");

		execSync(
			`npx wrangler pages functions build --build-output-directory public --outfile ${file} --bindings="{\\"d1_databases\\":{\\"FOO\\":{}}}"`,
			{
				cwd: path.resolve(__dirname, ".."),
			}
		);

		expect(readFileSync(file, "utf-8")).toContain("D1_ERROR");
		expect(readFileSync(file, "utf-8")).toContain('"static"');
	});
});

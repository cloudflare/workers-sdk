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
			["--port=0", "--d1=D1"]
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
			fetch(`http://${ip}:${port}/other-script.js`).then((resp) => resp.text())
		).resolves.toContain("other-script-test");
		await expect(
			fetch(`http://${ip}:${port}/d1`).then((resp) => resp.text())
		).resolves.toContain('{"1":1}');
		await stop();
	});

	it("should bundle", async ({ expect }) => {
		const dir = tmpdir();
		const file = join(dir, "./_worker.bundle");

		execSync(
			`npx wrangler pages functions build --build-output-directory public --outfile ${file} --bindings="{\\"d1_databases\\":{\\"D1\\":{}}}"`,
			{
				cwd: path.resolve(__dirname, ".."),
			}
		);

		const contents = readFileSync(file, "utf-8");

		expect(contents).toContain("D1_ERROR");
		expect(contents).toContain('"other-script-test"');
		expect(contents).toContain('import staticMod from "./static.js";');
	});
});

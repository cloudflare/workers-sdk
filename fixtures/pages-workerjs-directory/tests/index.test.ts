import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join, resolve } from "node:path";
import { fetch } from "undici";
import { describe, expect, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages _worker.js/ directory", () => {
	it("should support non-bundling with 'dev'", async () => {
		const tmpDir = realpathSync(
			mkdtempSync(join(tmpdir(), "worker-directory-tests"))
		);

		const { ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"public",
			[
				"--port=0",
				"--inspector-port=0",
				`--persist-to=${tmpDir}`,
				"--d1=D1",
				"--d1=PUT=elsewhere",
				"--kv=KV",
				"--kv=KV_REF=other_kv",
				"--r2=r2bucket",
				"--r2=R2_REF=other-r2",
			]
		);
		try {
			await expect(
				fetch(`http://${ip}:${port}/`).then((resp) => resp.text())
			).resolves.toContain("Hello, world!");
			await expect(
				fetch(`http://${ip}:${port}/wasm`).then((resp) => resp.text())
			).resolves.toContain("3");
			await expect(
				fetch(`http://${ip}:${port}/static-js`).then((resp) => resp.text())
			).resolves.toEqual("static import text (via js): 'js static'");
			await expect(
				fetch(`http://${ip}:${port}/static-mjs`).then((resp) => resp.text())
			).resolves.toEqual("static import text (via mjs): 'mjs static'");
			await expect(
				fetch(`http://${ip}:${port}/other-script.js`).then((resp) =>
					resp.text()
				)
			).resolves.toContain("other-script-test");
			await expect(
				fetch(`http://${ip}:${port}/other-other-script.mjs`).then((resp) =>
					resp.text()
				)
			).resolves.toContain("other-other-script-test");
			await expect(
				fetch(`http://${ip}:${port}/d1`).then((resp) => resp.text())
			).resolves.toContain('{"1":1}');
			await expect(
				fetch(`http://${ip}:${port}/kv`).then((resp) => resp.text())
			).resolves.toContain("saved");
			await expect(
				fetch(`http://${ip}:${port}/r2`).then((resp) => resp.text())
			).resolves.toContain("saved");
		} finally {
			await stop();
		}

		expect(existsSync(join(tmpDir, "./v3/d1"))).toBeTruthy();
		expect(existsSync(join(tmpDir, "./v3/kv"))).toBeTruthy();
		expect(existsSync(join(tmpDir, "./v3/r2"))).toBeTruthy();
	});

	it("should bundle", async () => {
		const tempDir = realpathSync(
			mkdtempSync(join(tmpdir(), "worker-bundle-tests"))
		);
		const file = join(tempDir, "_worker.bundle");

		execSync(
			`npx wrangler pages functions build --build-output-directory public --outfile ${file} --bindings="{\\"d1_databases\\":{\\"D1\\":{}}}"`,
			{
				cwd: path.resolve(__dirname, ".."),
			}
		);

		const contents = readFileSync(file, "utf-8");

		expect(contents).not.toContain("D1_ERROR"); // No more D1 shim in the bundle!
		expect(contents).toContain('"other-script-test"');
		expect(contents).toContain('"other-other-script-test"');
		expect(contents).toContain('import staticJsMod from "./static.js";');
		expect(contents).toContain('import staticMjsMod from "./static.mjs";');
	});
});

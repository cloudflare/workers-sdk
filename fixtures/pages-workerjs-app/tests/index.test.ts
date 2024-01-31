import { execSync } from "node:child_process";
import { rename } from "node:fs/promises";
import path, { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fetch } from "undici";
import { describe, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages _worker.js", () => {
	it("should throw an error when the _worker.js file imports something and --bundle is false", ({
		expect,
	}) => {
		expect(() =>
			execSync("pnpm run dev -- --bundle=false", {
				cwd: path.resolve(__dirname, ".."),
				stdio: "ignore",
			})
		).toThrowError();
	});

	it("should throw an error when the _worker.js file imports something and --no-bundle is true", ({
		expect,
	}) => {
		expect(() =>
			execSync("pnpm run dev -- --no-bundle", {
				cwd: path.resolve(__dirname, ".."),
				stdio: "ignore",
			})
		).toThrowError();
	});

	it("should not throw an error when the _worker.js file imports something if --no-bundle is false", async ({
		expect,
	}) => {
		const { ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"./workerjs-test",
			["--no-bundle=false", "--port=0", "--inspector-port=0"]
		);
		try {
			await expect(
				fetch(`http://${ip}:${port}/`).then((resp) => resp.text())
			).resolves.toContain("test");
		} finally {
			await stop();
		}
	});

	it("should not throw an error when the _worker.js file imports something if --bundle is true", async ({
		expect,
	}) => {
		const { ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"./workerjs-test",
			["--bundle", "--port=0", "--inspector-port=0"]
		);
		try {
			await expect(
				fetch(`http://${ip}:${port}/`).then((resp) => resp.text())
			).resolves.toContain("test");
		} finally {
			await stop();
		}
	});

	it("should not error if the worker.js file is removed while watching", async ({
		expect,
	}) => {
		const basePath = resolve(__dirname, "..");
		const { ip, port, getOutput, clearOutput, stop } =
			await runWranglerPagesDev(resolve(__dirname, ".."), "./workerjs-test", [
				"--port=0",
				"--inspector-port=0",
			]);
		try {
			clearOutput();
			await tryRename(
				basePath,
				"workerjs-test/_worker.js",
				"workerjs-test/XXX_worker.js"
			);
			await setTimeout(1000);
			expect(getOutput()).toMatchInlineSnapshot('""');

			clearOutput();
			await tryRename(
				basePath,
				"workerjs-test/XXX_worker.js",
				"workerjs-test/_worker.js"
			);
			await setTimeout(1000);
			expect(getOutput()).toMatchInlineSnapshot(`
				"[2K[1A[2K[G✨ Compiled Worker successfully

				[2K[1A[2K[G⎔ Reloading local server...

				[2K[1A[2K[G
				[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mkj/filesystem-disk-unix.c++:1709: warning: PWD environment variable doesn't match current directory; pwd = /Users/pbacondarwin/dev/cloudflare/workers-sdk[0m


				"
			`);
		} finally {
			await stop();
			await tryRename(
				basePath,
				"workerjs-test/XXX_worker.js",
				"workerjs-test/_worker.js"
			);
		}
	});

	async function tryRename(
		basePath: string,
		from: string,
		to: string
	): Promise<void> {
		try {
			await rename(resolve(basePath, from), resolve(basePath, to));
		} catch (e) {
			// Do nothing if the file was not found
			if ((e as any).code !== "ENOENT") {
				throw e;
			}
		}
	}
});

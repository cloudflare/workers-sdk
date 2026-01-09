import { execSync } from "node:child_process";
import { rename } from "node:fs/promises";
import path, { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fetch } from "undici";
import { describe, expect, it, vi } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages _worker.js", () => {
	it("should throw an error when the _worker.js file imports something and --bundle is false", () => {
		expect(() =>
			execSync("pnpm run dev -- --bundle=false", {
				cwd: path.resolve(__dirname, ".."),
				stdio: "ignore",
			})
		).toThrowError();
	});

	it("should throw an error when the _worker.js file imports something and --no-bundle is true", () => {
		expect(() =>
			execSync("pnpm run dev -- --no-bundle", {
				cwd: path.resolve(__dirname, ".."),
				stdio: "ignore",
			})
		).toThrowError();
	});

	it("should not throw an error when the _worker.js file imports something if --no-bundle is false", async () => {
		const { ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"./workerjs-test",
			[
				"--no-bundle=false",
				"--port=0",
				"--inspector-port=0",
				"--compatibility-date=2025-07-15",
			]
		);
		try {
			await expect(
				fetch(`http://${ip}:${port}/`).then((resp) => resp.text())
			).resolves.toContain("test");
		} finally {
			await stop();
		}
	});

	it("should not throw an error when the _worker.js file imports something if --bundle is true", async () => {
		const { ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"./workerjs-test",
			[
				"--bundle",
				"--port=0",
				"--inspector-port=0",
				"--compatibility-date=2025-07-15",
			]
		);
		try {
			await expect(
				fetch(`http://${ip}:${port}/`).then((resp) => resp.text())
			).resolves.toContain("test");
		} finally {
			await stop();
		}
	});

	it("should not error if the worker.js file is removed while watching", async () => {
		const basePath = resolve(__dirname, "..");
		const { ip, port, getOutput, clearOutput, stop } =
			await runWranglerPagesDev(resolve(__dirname, ".."), "./workerjs-test", [
				"--port=0",
				"--inspector-port=0",
				"--compatibility-date=2025-07-15",
			]);
		await vi.waitFor(
			() => {
				expect(getOutput()).toContain("Ready on");
			},
			{
				timeout: 5_000,
			}
		);
		await setTimeout(200);
		try {
			clearOutput();
			await tryRename(
				basePath,
				"workerjs-test/_worker.js",
				"workerjs-test/XXX_worker.js"
			);
			await setTimeout(200);
			// Expect no output since the deletion of the worker should be ignored
			expect(getOutput()).toBe("");
			await tryRename(
				basePath,
				"workerjs-test/XXX_worker.js",
				"workerjs-test/_worker.js"
			);
			await setTimeout(200);
			// Expect replacing the worker to now trigger a success build.
			expect(getOutput()).toContain("Compiled Worker successfully");
		} finally {
			await stop();
			await tryRename(
				basePath,
				"workerjs-test/XXX_worker.js",
				"workerjs-test/_worker.js"
			);
		}
	});

	it("should not error if the _routes.json file is removed while watching", async () => {
		const basePath = resolve(__dirname, "..");
		const { ip, port, getOutput, clearOutput, stop } =
			await runWranglerPagesDev(resolve(__dirname, ".."), "./workerjs-test", [
				"--port=0",
				"--inspector-port=0",
			]);
		await vi.waitFor(
			() => {
				expect(getOutput()).toContain("Ready on");
			},
			{
				timeout: 5_000,
			}
		);
		await setTimeout(200);
		try {
			clearOutput();
			await tryRename(
				basePath,
				"workerjs-test/_routes.json",
				"workerjs-test/XXX_routes.json"
			);
			await setTimeout(200);
			// Expect no output since the deletion of the routes file should be ignored
			expect(getOutput()).toBe("");
			await tryRename(
				basePath,
				"workerjs-test/XXX_routes.json",
				"workerjs-test/_routes.json"
			);
			await setTimeout(200);
			// Expect replacing the routes file to trigger a build, although
			// the routes build does not provide any output feedback to compare against,
			// so we just check that nothing else is being printed.
			expect(getOutput()).toBe("");
		} finally {
			await stop();
			await tryRename(
				basePath,
				"workerjs-test/XXX_routes.json",
				"workerjs-test/_routes.json"
			);
		}
	});

	// Serendipitously, this .env reading also works for `wrangler pages dev`.
	it("should read local dev vars from the .env file", async () => {
		const { ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"./workerjs-test",
			["--port=0", "--inspector-port=0", "--compatibility-date=2025-07-15"]
		);
		try {
			const response = await fetch(`http://${ip}:${port}/env`);
			const env = (await response.json()) as { FOO: string };
			expect(env.FOO).toBe("bar");
		} finally {
			await stop();
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

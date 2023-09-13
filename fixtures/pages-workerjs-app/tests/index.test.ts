import { execSync } from "node:child_process";
import path, { resolve } from "node:path";
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
			["--no-bundle=false", "--port=0"]
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
			["--bundle", "--port=0"]
		);
		try {
			await expect(
				fetch(`http://${ip}:${port}/`).then((resp) => resp.text())
			).resolves.toContain("test");
		} finally {
			await stop();
		}
	});
});

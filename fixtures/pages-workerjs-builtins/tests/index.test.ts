import { execSync } from "node:child_process";
import path, { resolve } from "node:path";
import { fetch } from "undici";
import { describe, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages _worker.js with node & cloudflare builtin imports", () => {
	it("should not throw an error when the _worker.js file imports builtins and --bundle is false", async ({
		expect,
	}) => {
		const { ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"./workerjs-test",
			["--bundle=false", "--port=0"]
		);
		try {
			await expect(
				fetch(`http://${ip}:${port}/`).then((resp) => resp.text())
			).resolves.toContain("test");
		} finally {
			await stop();
		}
	});

	it("should not throw an error when the _worker.js file imports builtins and --no-bundle is true", async ({
		expect,
	}) => {
		const { ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"./workerjs-test",
			["--no-bundle", "--port=0"]
		);
		try {
			await expect(
				fetch(`http://${ip}:${port}/`).then((resp) => resp.text())
			).resolves.toContain("test");
		} finally {
			await stop();
		}
	});

	it("should not throw an error when the _worker.js file imports builtins if --no-bundle is false", async ({
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

	it("should not throw an error when the _worker.js file imports builtins if --bundle is true", async ({
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

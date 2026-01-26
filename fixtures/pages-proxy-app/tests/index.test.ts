import { fork } from "node:child_process";
import { resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";
import type { ChildProcess } from "node:child_process";

describe("pages-proxy-app", async () => {
	let ip: string, port: number, stop: (() => Promise<unknown>) | undefined;
	let devServer: ChildProcess;

	beforeAll(async () => {
		devServer = fork(resolve(__dirname, "../dist/index.js"), {
			stdio: "ignore",
		});

		({ ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			undefined,
			["--port=0", "--inspector-port=0", "--proxy=8791"]
		));
	});

	afterAll(async () => {
		await stop?.();
		devServer.kill();
	});

	it("receives the correct Host header", async () => {
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toContain(`Host:${ip}:${port}`);
	});
});

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it, onTestFinished } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("dynamic worker loading", () => {
	let ip: string, port: number, stop: (() => Promise<unknown>) | undefined;

	beforeAll(async () => {
		({ ip, port, stop } = await runWranglerDev(resolve(__dirname, ".."), [
			"--port=0",
			"--inspector-port=0",
		]));
	});

	afterAll(async () => {
		await stop?.();
	});

	it("should respond with response from dynamic worker", async ({ expect }) => {
		let response = await fetch(`http://${ip}:${port}/my-worker`);
		let text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toMatchInlineSnapshot(
			`"Hello with a dynamic worker loaded for /my-worker"`
		);
	});

	it("should load different worker if ID changes", async ({ expect }) => {
		let response = await fetch(`http://${ip}:${port}/my-other-worker`);
		let text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toMatchInlineSnapshot(
			`"Hello with a dynamic worker loaded for /my-other-worker"`
		);
	});
});

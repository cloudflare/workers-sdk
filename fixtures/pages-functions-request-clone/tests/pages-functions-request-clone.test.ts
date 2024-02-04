import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages Functions - Request Clone", () => {
	let ip: string,
		port: number,
		stop: (() => Promise<unknown>) | undefined,
		getOutput: () => string;

	beforeAll(async () => {
		({ ip, port, stop, getOutput } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"public",
			[]
		));
	});

	afterAll(async () => {
		await stop?.();
	});

	it("single-handler POST requests work as expected and don't cause runtime errors/warnings", async ({
		expect,
	}) => {
		const response = await fetch(`http://${ip}:${port}/single-handler`, {
			method: "POST",
			body: "this is a test",
		});
		const text = await response.text();
		expect(text).toMatchInlineSnapshot(
			'"[POST] Received: \\"this is a test\\""'
		);
		await setTimeout(1000);
		const output = getOutput();
		expect(output).not.toContain(
			"Your worker created multiple branches of a single stream"
		);
	});

	it("multi-handler POST requests work as expected but cause runtime errors/warnings", async ({
		expect,
	}) => {
		const response = await fetch(`http://${ip}:${port}/multi-handler`, {
			method: "POST",
			body: "this is a test",
		});
		const text = await response.text();
		expect(text).toMatchInlineSnapshot(
			'"[POST] Received: \\"this is a test\\""'
		);
		await setTimeout(1000);
		const output = getOutput();
		expect(output).toContain(`[_MIDDLEWARE] Received: "this is a test"`);
		expect(output).toContain(
			"Your worker created multiple branches of a single stream"
		);
	});
});

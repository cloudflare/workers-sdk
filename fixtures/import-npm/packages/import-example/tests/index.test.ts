import { resolve } from "path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerDev } from "../../../../shared/src/run-wrangler-long-lived";

describe("wrangler correctly imports wasm files with npm resolution", () => {
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

	// if the worker compiles, is running, and returns 21 (7 * 3) we can assume that the wasm module was imported correctly
	it("responds", async () => {
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toBe("21, 21");
	});
});

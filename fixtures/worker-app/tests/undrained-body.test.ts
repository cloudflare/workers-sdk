import { resolve } from "path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("wrangler dev", () => {
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

	// https://github.com/cloudflare/workers-sdk/issues/5095
	it("should not fail requests if the Worker does not drain the body", async () => {
		const COUNT = 30;
		const requests: boolean[] = [];
		const errors: string[] = [];

		const body = new Uint8Array(2_000);
		for (let i = 0; i < COUNT; i++) {
			const response = await fetch(`http://${ip}:${port}/random`, {
				method: "POST",
				body,
			});
			requests.push(response.ok);
			if (!response.ok) {
				errors.push(await response.text());
			}
		}

		expect(requests.length).toBe(COUNT);
		expect(errors).toEqual([]);
		expect(requests).toEqual(Array.from({ length: COUNT }).map((i) => true));
	});
});

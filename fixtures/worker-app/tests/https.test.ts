import { resolve } from "path";
import { Agent, fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("'wrangler dev' starts HTTPS server", () => {
	let ip: string, port: number, stop: (() => Promise<unknown>) | undefined;

	beforeAll(async () => {
		({ ip, port, stop } = await runWranglerDev(resolve(__dirname, ".."), [
			"--port=0",
			"--inspector-port=0",
			"--local-protocol=https",
		]));
	});

	afterAll(async () => {
		await stop?.();
	});

	it("allows access over HTTPS", async () => {
		const dispatcher = new Agent({
			// `wrangler dev` will generate a self-signed certificate. By default,
			// Node will reject these. Therefore, we need to use a custom
			// dispatcher that accepts "invalid" certificates.
			connect: { rejectUnauthorized: false },
		});
		const response = await fetch(`https://${ip}:${port}/random`, {
			dispatcher,
		});
		expect(response.ok).toBe(true);
	});
});

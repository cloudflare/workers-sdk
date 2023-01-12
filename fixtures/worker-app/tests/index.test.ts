import { resolve } from "path";
import { fetch } from "undici";
import { describe, it, beforeAll, afterAll } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe.concurrent("'wrangler dev' correctly renders pages", () => {
	let ip, port, stop;

	beforeAll(async () => {
		({ ip, port, stop } = await runWranglerDev(resolve(__dirname, ".."), [
			"--local",
			"--port=0",
		]));
	});

	afterAll(async () => await stop());

	it("renders ", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toContain(`http://${ip}:${port}/`);
	});
});

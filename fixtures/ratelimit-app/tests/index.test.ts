import { resolve } from "path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("'wrangler dev' correctly renders pages", () => {
	let ip: string,
		port: number,
		stop: (() => Promise<unknown>) | undefined,
		getOutput: () => string;

	beforeAll(async () => {
		({ ip, port, stop, getOutput } = await runWranglerDev(
			resolve(__dirname, ".."),
			["--local", "--port=0", "--inspector-port=0"]
		));
	});

	afterAll(async () => {
		await stop?.();
	});

	it("ratelimit binding is defined ", async ({ expect }) => {
		let response = await fetch(`http://${ip}:${port}/`);
		let content = await response.text();
		expect(content).toEqual("Success");

		response = await fetch(`http://${ip}:${port}/`);
		content = await response.text();
		expect(content).toEqual("Success");

		response = await fetch(`http://${ip}:${port}/`);
		content = await response.text();
		expect(content).toEqual("Slow down");
	});
});

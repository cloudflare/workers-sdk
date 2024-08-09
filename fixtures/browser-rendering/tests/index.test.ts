import { resolve } from "path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("'wrangler dev' lauches a browser", () => {
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

	it("borwser binding methods ", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/`);
		// console.log(await response.text())
		const content = await response.json();
		expect((content as Record<string, object>).fetch).toEqual("function");
	});

	it("browser rendering binding properties", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/`);
		const content = await response.json();
		expect((content as Record<string, object>).binding).toEqual({
			fetcher: {},
			lastRequestId: null,
			logs: [],
			options: {},
		});
	});
});

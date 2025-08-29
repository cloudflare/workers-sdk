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

	it("ai binding methods ", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/`);
		const content = await response.json();
		expect((content as Record<string, object>).fetch).toEqual("function");
		expect((content as Record<string, object>).run).toEqual("function");
	});

	it("ai binding properties", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/`);
		const content = await response.json();
		expect((content as Record<string, object>).binding).toEqual({
			aiGatewayLogId: null,
			lastRequestHttpStatusCode: null,
			lastRequestId: null,
			lastRequestInternalStatusCode: null,
		});
	});
});

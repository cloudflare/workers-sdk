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

	it("ai binding is defined ", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/`);
		const content = await response.json();
		expect(content).toEqual({
			binding: {},
			fetcher: "function fetch() { [native code] }",
		});
	});
});

import { resolve } from "path";
import { fetch } from "undici";
import { describe, it, beforeAll, afterAll } from "vitest";
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

	it("renders ", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toContain(`http://${ip}:${port}/`);

		// Ensure `console.log()`s from startup and requests are shown
		const output = getOutput();
		expect(output).toContain("startup log");
		expect(output).toContain("request log");
	});

	it("uses `workerd` condition when bundling", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/random`);
		const text = await response.text();
		expect(text).toMatch(/[0-9a-f]{16}/); // 8 hex bytes
	});
});

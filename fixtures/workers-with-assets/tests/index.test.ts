import { resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("[Workers + Assets] `wrangler dev`", () => {
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

	it("should respond with static asset content", async ({ expect }) => {
		let response = await fetch(`http://${ip}:${port}/index.html`);
		let text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toContain(`<h1>Hello Workers + Assets World 🚀!</h1>`);

		response = await fetch(`http://${ip}:${port}/about/index.html`);
		text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toContain(`<p>Learn more about Workers with Assets soon!</p>`);
	});

	it("should not resolve '/' to '/index.html' ", async ({ expect }) => {
		let response = await fetch(`http://${ip}:${port}/`);
		let text = await response.text();
		expect(response.status).toBe(404);
		expect(text).toContain("Not Found");
	});
});

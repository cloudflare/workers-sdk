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

	it("renders ", async ({ expect }) => {
		let response = await fetch(`http://${ip}:${port}/index.html`);
		let text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toContain(`<h1>Hello Workers + Assets World 🚀!</h1>`);

		response = await fetch(`http://${ip}:${port}/about/index.html`);
		text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toContain(`<p>Learn more about Workers with Assets soon!</p>`);
	});

	it("does not resolve '/' to '/index.html' ", async ({ expect }) => {
		let response = await fetch(`http://${ip}:${port}/`);
		expect(response.status).toBe(200);
		let text = await response.text();
		expect(text).toContain(
			`[{"name":"about","type":"directory"},{"name":"index.html","type":"file"}]`
		);
	});
});

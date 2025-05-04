import { resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("[Workers + Assets] worker_first_paths with SPA fallback", () => {
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

	it("should return worker response for /api/anything", async ({ expect }) => {
		let response = await fetch(`http://${ip}:${port}/api/anything`);
		let text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toBe("API HANDLED BY WORKER");
	});

	it("should return SPA index.html for /not-a-real-asset", async ({
		expect,
	}) => {
		let response = await fetch(`http://${ip}:${port}/not-a-real-asset`);
		let text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toContain("SPA Index Page");
	});

	it("should return static asset for /index.html", async ({ expect }) => {
		let response = await fetch(`http://${ip}:${port}/index.html`);
		let text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toContain("SPA Index Page");
	});

	it("should NOT return worker response for /not-api/anything (should hit SPA fallback)", async ({
		expect,
	}) => {
		let response = await fetch(`http://${ip}:${port}/not-api/anything`);
		let text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toContain("SPA Index Page");
	});
});

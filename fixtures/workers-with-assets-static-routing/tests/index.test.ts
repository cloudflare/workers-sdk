import { resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("[Workers + Assets] static routing", () => {
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

	it("should serve assets when they exist for a path", async ({ expect }) => {
		let response = await fetch(`http://${ip}:${port}/static/page`);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain(`<h1>A normal asset</h1>`);
	});

	it("should run the worker when no assets exist for a path", async ({
		expect,
	}) => {
		let response = await fetch(`http://${ip}:${port}/`);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain(`Hello from the User Worker`);
	});

	it("should run the worker when an include rule matches", async ({
		expect,
	}) => {
		let response = await fetch(`http://${ip}:${port}/worker/worker-runs`);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain(
			`<h1>Hello, I'm an asset (and was intercepted by the User Worker)!</h1>`
		);
	});

	it("should serve an asset when an exclude rule matches", async ({
		expect,
	}) => {
		let response = await fetch(`http://${ip}:${port}/missing-asset`);
		expect(response.status).toBe(404);
	});

	it("should serve an asset when an include and an exclude rule matches", async ({
		expect,
	}) => {
		let response = await fetch(`http://${ip}:${port}/worker/asset`);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain(`<h1>Hello, I'm an asset!</h1>`);
	});
});

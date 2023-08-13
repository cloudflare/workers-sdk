import { resolve } from "path";
import { fetch } from "undici";
import { describe, it, beforeAll, afterAll } from "vitest";
import { runTriangleDev } from "../../shared/src/run-triangle-long-lived";

<<<<<<< HEAD
describe.concurrent("'triangle dev' correctly renders pages", () => {
	let ip, port, stop;
=======
describe("'wrangler dev' correctly renders pages", () => {
	let ip: string, port: number, stop: () => Promise<unknown>;
>>>>>>> da9ba3c855317c6071eb892def4965706f2fb97f

	beforeAll(async () => {
		({ ip, port, stop } = await runTriangleDev(resolve(__dirname, ".."), [
			"--local",
			"--port=0",
		]));
	});

	afterAll(async () => {
		await stop();
	});

	it("renders ", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toContain(`http://${ip}:${port}/`);
	});

	it("uses `workerd` condition when bundling", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/random`);
		const text = await response.text();
		expect(text).toMatch(/[0-9a-f]{16}/); // 8 hex bytes
	});
});

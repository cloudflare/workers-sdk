import { resolve } from "node:path";
import { fetch } from "undici";
import { describe, it, beforeAll, afterAll } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe.concurrent("Pages Advanced Mode with wasm module imports", () => {
	let ip, port, stop;

	beforeAll(async () => {
		({ ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"public",
			["--port=0"]
		));
	});

	afterAll(async () => await stop());

	it("should render static pages", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}`);
		const text = await response.text();
		expect(text).toContain("Hello from pages-workerjs-wasm-app!");
	});

	it("should resolve any wasm module imports and render the correct response", async ({
		expect,
	}) => {
		const response = await fetch(`http://${ip}:${port}/meaning-of-life`);
		const text = await response.text();
		expect(text).toEqual(
			"Hello _worker.js WASM World! The meaning of life is 21"
		);
	});
});

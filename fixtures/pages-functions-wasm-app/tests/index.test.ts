import { resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages Functions with wasm module imports", () => {
	let ip: string, port: number, stop: (() => Promise<unknown>) | undefined;

	beforeAll(async () => {
		({ ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"public",
			["--port=0", "--inspector-port=0"]
		));
	});

	afterAll(async () => {
		await stop?.();
	});

	it("should render static pages", async () => {
		const response = await fetch(`http://${ip}:${port}`);
		const text = await response.text();
		expect(text).toContain("Hello from pages-functions-wasm-app!");
	});

	it("should resolve wasm module imports and render /meaning-of-life-wasm", async () => {
		const response = await fetch(`http://${ip}:${port}/meaning-of-life-wasm`);
		const text = await response.text();
		expect(text).toEqual("[.wasm]: The meaning of life is 21");
	});

	it("should resolve text module imports and render /meaning-of-life-wasm-text", async () => {
		const response = await fetch(`http://${ip}:${port}/meaning-of-life-text`);
		const text = await response.text();
		expect(text).toEqual("[.txt]: The meaning of life is 21");
	});

	it("should resolve html module imports and render /meaning-of-life-wasm-html", async () => {
		const response = await fetch(`http://${ip}:${port}/meaning-of-life-html`);
		const text = await response.text();
		expect(text).toContain(`[.html]: The meaning of life is 21`);
	});
});

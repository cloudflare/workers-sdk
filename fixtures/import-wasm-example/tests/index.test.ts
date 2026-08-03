import { resolve } from "path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createTestHarness } from "wrangler";

describe("wrangler correctly imports wasm files with npm resolution", () => {
	const server = createTestHarness({
		root: resolve(__dirname, ".."),
		workers: [{ configPath: "wrangler.jsonc" }],
	});

	beforeAll(async () => {
		await server.listen();
	});

	afterAll(async () => {
		await server.close();
	});

	// if the worker compiles, is running, and returns 21 (7 * 3) we can assume that the wasm module was imported correctly
	it("responds", async ({ expect }) => {
		const response = await server.fetch("/");
		const text = await response.text();
		expect(text).toBe("21, 21");
	});
});

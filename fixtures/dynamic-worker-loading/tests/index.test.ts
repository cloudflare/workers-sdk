import { resolve } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createTestHarness } from "wrangler";

describe("dynamic worker loading", () => {
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

	it("should respond with response from dynamic worker", async ({ expect }) => {
		let response = await server.fetch("/my-worker");
		let text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toMatchInlineSnapshot(
			`"Hello with a dynamic worker loaded for /my-worker"`
		);
	});

	it("should load different worker if ID changes", async ({ expect }) => {
		let response = await server.fetch("/my-other-worker");
		let text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toMatchInlineSnapshot(
			`"Hello with a dynamic worker loaded for /my-other-worker"`
		);
	});
});

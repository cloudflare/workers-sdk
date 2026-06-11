import { resolve } from "path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createTestHarness } from "wrangler";

const basePath = resolve(__dirname, "..");
const server = createTestHarness({
	root: basePath,
	workers: [{ configPath: "wrangler.jsonc" }],
});

describe("Rate limiting bindings", () => {
	beforeAll(async () => {
		await server.listen();
	});

	afterAll(async () => {
		await server.close();
	});

	it("ratelimit binding is defined ", async ({ expect }) => {
		let response = await server.fetch("/");
		let content = await response.text();
		expect(content).toEqual("Success");

		response = await server.fetch("/");
		content = await response.text();
		expect(content).toEqual("Success");

		response = await server.fetch("/");
		content = await response.text();
		expect(content).toEqual("Success");

		response = await server.fetch("/");
		content = await response.text();
		expect(content).toEqual("Slow down");
	});

	it("ratelimit unsafe binding is defined ", async ({ expect }) => {
		let response = await server.fetch("/unsafe");
		let content = await response.text();
		expect(content).toEqual("unsafe: Success");

		response = await server.fetch("/unsafe");
		content = await response.text();
		expect(content).toEqual("unsafe: Success");

		response = await server.fetch("/unsafe");
		content = await response.text();
		expect(content).toEqual("unsafe: Slow down");
	});
});

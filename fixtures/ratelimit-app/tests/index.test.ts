import path, { resolve } from "path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createServer } from "wrangler";

const basePath = resolve(__dirname, "..");
const server = createServer({
	workers: [{ configPath: path.join(basePath, "wrangler.jsonc") }],
});

describe("Rate limiting bindings", () => {
	beforeAll(async () => {
		await server.listen();
	});

	afterAll(async () => {
		await server.close();
	});

	it("ratelimit binding is defined ", async ({ expect }) => {
		let response = await server.fetch(`http://example.com`);
		let content = await response.text();
		expect(content).toEqual("Success");

		response = await server.fetch(`http://example.com`);
		content = await response.text();
		expect(content).toEqual("Success");

		response = await server.fetch(`http://example.com`);
		content = await response.text();
		expect(content).toEqual("Success");

		response = await server.fetch(`http://example.com`);
		content = await response.text();
		expect(content).toEqual("Slow down");
	});

	it("ratelimit unsafe binding is defined ", async ({ expect }) => {
		let response = await server.fetch(`http://example.com/unsafe`);
		let content = await response.text();
		expect(content).toEqual("unsafe: Success");

		response = await server.fetch(`http://example.com/unsafe`);
		content = await response.text();
		expect(content).toEqual("unsafe: Success");

		response = await server.fetch(`http://example.com/unsafe`);
		content = await response.text();
		expect(content).toEqual("unsafe: Slow down");
	});
});

import path, { resolve } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_startWorker } from "wrangler";

const basePath = resolve(__dirname, "..");

describe("Rate limiting bindings", () => {
	let worker: Awaited<ReturnType<typeof unstable_startWorker>>;

	beforeAll(async () => {
		worker = await unstable_startWorker({
			config: path.join(basePath, "wrangler.jsonc"),
		});
	});

	afterAll(async () => {
		await worker.dispose();
	});

	it("ratelimit binding is defined ", async () => {
		let response = await worker.fetch(`http://example.com`);
		let content = await response.text();
		expect(content).toEqual("Success");

		response = await worker.fetch(`http://example.com`);
		content = await response.text();
		expect(content).toEqual("Success");

		response = await worker.fetch(`http://example.com`);
		content = await response.text();
		expect(content).toEqual("Success");

		response = await worker.fetch(`http://example.com`);
		content = await response.text();
		expect(content).toEqual("Slow down");
	});

	it("ratelimit unsafe binding is defined ", async () => {
		let response = await worker.fetch(`http://example.com/unsafe`);
		let content = await response.text();
		expect(content).toEqual("unsafe: Success");

		response = await worker.fetch(`http://example.com/unsafe`);
		content = await response.text();
		expect(content).toEqual("unsafe: Success");

		response = await worker.fetch(`http://example.com/unsafe`);
		content = await response.text();
		expect(content).toEqual("unsafe: Slow down");
	});
});

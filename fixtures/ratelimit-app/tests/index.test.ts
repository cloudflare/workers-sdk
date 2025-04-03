import path, { resolve } from "path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { unstable_startWorker } from "wrangler";

const basePath = resolve(__dirname, "..");

describe("'wrangler dev' correctly renders pages", () => {
	let worker: Awaited<ReturnType<typeof unstable_startWorker>>;

	beforeAll(async () => {
		worker = await unstable_startWorker({
			config: path.join(basePath, "wrangler.toml"),
		});
	});

	afterAll(async () => {
		await worker.dispose();
	});

	it("ratelimit binding is defined ", async ({ expect }) => {
		let response = await worker.fetch(`http://example.com`);
		let content = await response.text();
		expect(content).toEqual("Success");

		response = await worker.fetch(`http://example.com`);
		content = await response.text();
		expect(content).toEqual("Success");

		response = await worker.fetch(`http://example.com`);
		content = await response.text();
		expect(content).toEqual("Slow down");
	});
});

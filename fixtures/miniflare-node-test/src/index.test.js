import { Miniflare } from "miniflare";
import assert from "node:assert";
import test, { after, before, describe } from "node:test";

describe("worker", () => {
	/**
	 * @type {Miniflare}
	 */
	let worker;

	before(async () => {
		worker = new Miniflare({
			modules: [
				{
					type: "ESModule",
					path: "src/index.js",
				},
			],
		});
		await worker.ready;
	});

	test("hello world", async () => {
		assert.strictEqual(
			await (await worker.dispatchFetch("http://example.com")).text(),
			"Hello World"
		);
	});

	after(async () => {
		await worker.dispose();
	});
});

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
			scriptPath: "src/index-with-imports.js",
			modules: true,
			modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
		});
		try {
			await worker.ready;
		} catch (e) {
			console.error(e);
		}
	});

	test("hello world", async () => {
		assert.strictEqual(
			await (await worker.dispatchFetch("http://example.com/path")).text(),
			"Hello from http://example.com/path"
		);
	});

	after(async () => {
		await worker.dispose();
	});
});

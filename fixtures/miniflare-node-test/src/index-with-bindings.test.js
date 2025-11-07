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
			bindings: {
				FOO: "Hello Bindings",
			},
			kvNamespaces: ["KV"],
		});
		await worker.ready;
	});

	test("hello world", async () => {
		assert.strictEqual(
			await (await worker.dispatchFetch("http://example.com")).text(),
			"Hello World"
		);
	});

	test("text binding", async () => {
		const bindings = await worker.getBindings();
		assert.strictEqual(bindings.FOO, "Hello Bindings");
	});

	test("kv binding", async () => {
		/**
		 * @type {{KV: import("@cloudflare/workers-types/experimental").KVNamespace, FOO: string}}
		 */
		const bindings = await worker.getBindings();
		await bindings.KV.put("key", "value");
		assert.strictEqual(await bindings.KV.get("key"), "value");
	});

	after(async () => {
		await worker.dispose();
	});
});

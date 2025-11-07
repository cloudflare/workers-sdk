import { Miniflare } from "miniflare";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import test, { after, before, describe } from "node:test";

before(() => {
	spawnSync("npx wrangler build -c wrangler-build.json", {
		shell: true,
		stdio: "pipe",
	});
});

describe("worker build", () => {
	/**
	 * @type {Miniflare}
	 */
	let worker;

	before(async () => {
		worker = new Miniflare({
			modules: [
				{
					type: "ESModule",
					path: "dist/index.js",
				},
			],
		});
		await worker.ready;
	});

	test("even", async () => {
		assert.strictEqual(
			await (await worker.dispatchFetch("http://example.com?number=2")).text(),
			"even"
		);
	});

	after(async () => {
		await worker.dispose();
	});
});

import path from "path";
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

describe("worker in local mode", () => {
	let worker: UnstableDevWorker;

	beforeAll(async () => {
		//since the script is invoked from the directory above, need to specify index.js is in src/
		worker = await unstable_dev(
			path.resolve(__dirname, "..", "src", "basicModule.ts"),
			{
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			}
		);
	});

	afterAll(async () => {
		await worker.stop();
	});

	it("should invoke the worker and exit", async () => {
		const resp = await worker.fetch();
		expect(resp).not.toBe(undefined);
		if (resp) {
			const text = await resp.text();

			expect(text).toMatchInlineSnapshot(`"Hello World!"`);
		}
	});
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_dev } from "wrangler";
import type { Unstable_DevWorker } from "wrangler";

describe("Worker", () => {
	let worker: Unstable_DevWorker;

	beforeAll(async () => {
		worker = await unstable_dev("src/index.ts", {
			experimental: { disableExperimentalWarning: true },
		});
	});

	afterAll(async () => {
		await worker.stop();
	});

	it("should return Hello World", async () => {
		const resp = await worker.fetch();
		if (resp) {
			const text = await resp.text();
			expect(text).toMatchInlineSnapshot(`"Hello World!"`);
		}
	});
});

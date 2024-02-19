import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

describe("Worker", () => {
	let worker: UnstableDevWorker;

	beforeAll(async () => {
		worker = await unstable_dev("src/index.ts", {
			experimental: { disableExperimentalWarning: true },
		});
	});

	afterAll(async () => {
		await worker.stop();
	});

	it("should return HTML on the root", async () => {
		const resp = await worker.fetch("/");
		if (resp) {
			const contentType = resp.headers.get("content-type");
			expect(contentType).toBe("text/html; charset=UTF-8");
		}
	});
});

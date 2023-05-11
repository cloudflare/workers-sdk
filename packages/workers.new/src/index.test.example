import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

describe("Worker", () => {
	let worker: UnstableDevWorker;

	beforeAll(async () => {
		worker = await unstable_dev(`${__dirname}/index.ts`, {
			experimental: { disableExperimentalWarning: true },
			local: true,
		});
	});

	afterAll(async () => {
		await worker.stop();
	});

	it("should return that the response redirected", async () => {
		const resp = await worker.fetch();
		if (resp) {
			expect(resp.redirected).toBe(true);
			expect(resp.url).toBe(
				"https://dash.cloudflare.com/?to=/:account/workers/services/new"
			);
		}
	});
});

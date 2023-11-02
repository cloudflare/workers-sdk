import path from "path";
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

describe("worker", () => {
	let worker: UnstableDevWorker;

	beforeAll(async () => {
		worker = await unstable_dev(
			path.resolve(__dirname, "..", "src", "nodeBuiltinPackage.ts"),
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

	it.concurrent("returns hex string", async () => {
		const resp = await worker.fetch();
		expect(resp).not.toBe(undefined);

		const text = await resp.text();
		expect(text).toMatch("68656c6c6f");
	});
});

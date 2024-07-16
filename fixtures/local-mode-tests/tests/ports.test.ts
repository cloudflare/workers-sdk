import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

for (let index = 0; index < 100; index++) {
	describe("multiple workers", () => {
		let workers: UnstableDevWorker[];

		beforeAll(async () => {
			//since the script is invoked from the directory above, need to specify index.js is in src/

			workers = [
				await unstable_dev(path.resolve(__dirname, "..", "src", "module.ts"), {
					ip: "127.0.0.1",
					port: 4589,
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				}),
				await unstable_dev(path.resolve(__dirname, "..", "src", "module.ts"), {
					ip: "127.0.0.1",
					port: 4590,
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				}),
				await unstable_dev(path.resolve(__dirname, "..", "src", "module.ts"), {
					ip: "127.0.0.1",
					port: 4591,
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				}),
			];
		});

		afterAll(async () => {
			await Promise.all(workers.map(async (worker) => await worker.stop()));
		});

		it("all workers should be fetchable", async () => {
			const responses = await Promise.all(
				workers.map(async (worker) => await worker.fetch())
			);
			const parsedResponses = await Promise.all(
				responses.map(async (resp) => await resp.text())
			);

			expect(parsedResponses).not.toBe(undefined);
			expect(parsedResponses.length).toBe(3);
			expect(parsedResponses).toEqual([
				'{"greeting":"Hi!"}',
				'{"greeting":"Hi!"}',
				'{"greeting":"Hi!"}',
			]);
		});
	});
}

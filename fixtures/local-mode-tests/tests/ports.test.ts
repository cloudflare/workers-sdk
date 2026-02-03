import path from "path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { unstable_dev } from "wrangler";
import type { Unstable_DevWorker } from "wrangler";

describe("multiple workers", () => {
	let workers: Unstable_DevWorker[];

	beforeAll(async () => {
		//since the script is invoked from the directory above, need to specify index.js is in src/

		workers = await Promise.all([
			unstable_dev(path.resolve(__dirname, "..", "src", "module.ts"), {
				ip: "127.0.0.1",
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
					devEnv: true,
				},
			}),
			unstable_dev(path.resolve(__dirname, "..", "src", "module.ts"), {
				ip: "127.0.0.1",
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
					devEnv: true,
				},
			}),
			unstable_dev(path.resolve(__dirname, "..", "src", "module.ts"), {
				ip: "127.0.0.1",
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
					devEnv: true,
				},
			}),
		]);
	});

	afterAll(async () => {
		await Promise.all(workers.map(async (worker) => await worker.stop()));
	});

	it.concurrent("all workers should be fetchable", async ({ expect }) => {
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

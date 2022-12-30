import path from "path";
import { dev } from "wrangler";
import type { DevWorker } from "wrangler";

// Okay this test is seriously flaky, even without devRegistry enabled
// TODO: figure out why we can't run 8 wranglers at once
describe.skip("worker", () => {
	let workers: DevWorker[];
	let resolveReadyPromise: (value: unknown) => void;
	const readyPromise = new Promise((resolve) => {
		resolveReadyPromise = resolve;
	});

	beforeAll(async () => {
		//since the script is invoked from the directory above, need to specify index.js is in src/

		workers = await Promise.all([
			dev(path.resolve(__dirname, "..", "src", "basicModule.ts"), {
				experimental: {
					disableDevRegistry: true,
				},
			}),
			dev(path.resolve(__dirname, "..", "src", "basicModule.ts"), {
				experimental: {
					disableDevRegistry: true,
				},
			}),
			dev(path.resolve(__dirname, "..", "src", "basicModule.ts"), {
				experimental: {
					disableDevRegistry: true,
				},
			}),
			dev(path.resolve(__dirname, "..", "src", "basicModule.ts"), {
				experimental: {
					disableDevRegistry: true,
				},
			}),
			dev(path.resolve(__dirname, "..", "src", "basicModule.ts"), {
				experimental: {
					disableDevRegistry: true,
				},
			}),
			dev(path.resolve(__dirname, "..", "src", "basicModule.ts"), {
				experimental: {
					disableDevRegistry: true,
				},
			}),
			dev(path.resolve(__dirname, "..", "src", "basicModule.ts"), {
				experimental: {
					disableDevRegistry: true,
				},
			}),
			dev(path.resolve(__dirname, "..", "src", "basicModule.ts"), {
				experimental: {
					disableDevRegistry: true,
				},
			}),
		]);

		resolveReadyPromise(undefined);
	});

	afterAll(async () => {
		await readyPromise;
		await Promise.all(workers.map(async (worker) => await worker.stop()));
	});

	it.concurrent("should invoke the worker and exit", async () => {
		await readyPromise;

		const responses = await Promise.all(
			workers.map(async (worker) => await worker.fetch())
		);
		const parsedResponses = await Promise.all(
			responses.map(async (resp) => await resp.text())
		);

		expect(parsedResponses).not.toBe(undefined);
		expect(parsedResponses.length).toBe(8);
		expect(parsedResponses).toEqual([
			"Hello World!",
			"Hello World!",
			"Hello World!",
			"Hello World!",
			"Hello World!",
			"Hello World!",
			"Hello World!",
			"Hello World!",
		]);
	});
});

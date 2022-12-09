import path from "path";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

describe("worker", () => {
	let workers: UnstableDevWorker[];
	let resolveReadyPromise: (value: unknown) => void;
	const readyPromise = new Promise((resolve) => {
		resolveReadyPromise = resolve;
	});

	beforeAll(async () => {
		//since the script is invoked from the directory above, need to specify index.js is in src/

		workers = await Promise.all([
			unstable_dev(
				path.resolve(__dirname, "..", "src", "basicModule.ts"),
				{},
				{ disableExperimentalWarning: true }
			),
			unstable_dev(
				path.resolve(__dirname, "..", "src", "basicModule.ts"),
				{},
				{ disableExperimentalWarning: true }
			),
			unstable_dev(
				path.resolve(__dirname, "..", "src", "basicModule.ts"),
				{},
				{ disableExperimentalWarning: true }
			),
			unstable_dev(
				path.resolve(__dirname, "..", "src", "basicModule.ts"),
				{},
				{ disableExperimentalWarning: true }
			),
			unstable_dev(
				path.resolve(__dirname, "..", "src", "basicModule.ts"),
				{},
				{ disableExperimentalWarning: true }
			),
			unstable_dev(
				path.resolve(__dirname, "..", "src", "basicModule.ts"),
				{},
				{ disableExperimentalWarning: true }
			),
			unstable_dev(
				path.resolve(__dirname, "..", "src", "basicModule.ts"),
				{},
				{ disableExperimentalWarning: true }
			),
			unstable_dev(
				path.resolve(__dirname, "..", "src", "basicModule.ts"),
				{},
				{ disableExperimentalWarning: true }
			),
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

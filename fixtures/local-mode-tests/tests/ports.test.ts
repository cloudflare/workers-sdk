import { unstable_dev } from "wrangler";

describe("worker", () => {
	type Worker = {
		fetch: (input?: RequestInfo, init?: RequestInit) => Promise<Response>;
		stop: () => Promise<void>;
	};
	let workers: Worker[];

	beforeAll(async () => {
		//since the script is invoked from the directory above, need to specify index.js is in src/

		workers = await Promise.all([
			unstable_dev(
				"src/basicModule.ts",
				{},
				{ disableExperimentalWarning: true }
			) as Worker,
			unstable_dev(
				"src/basicModule.ts",
				{},
				{ disableExperimentalWarning: true }
			) as Worker,
			unstable_dev(
				"src/basicModule.ts",
				{},
				{ disableExperimentalWarning: true }
			) as Worker,
			unstable_dev(
				"src/basicModule.ts",
				{},
				{ disableExperimentalWarning: true }
			) as Worker,
			unstable_dev(
				"src/basicModule.ts",
				{},
				{ disableExperimentalWarning: true }
			) as Worker,
			unstable_dev(
				"src/basicModule.ts",
				{},
				{ disableExperimentalWarning: true }
			) as Worker,
			unstable_dev(
				"src/basicModule.ts",
				{},
				{ disableExperimentalWarning: true }
			) as Worker,
			unstable_dev(
				"src/basicModule.ts",
				{},
				{ disableExperimentalWarning: true }
			) as Worker,
		]);
	});

	afterAll(async () => {
		await Promise.all(workers.map(async (worker) => await worker.stop()));
	});

	it("should invoke the worker and exit", async () => {
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

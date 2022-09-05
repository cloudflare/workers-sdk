import { unstable_dev } from "wrangler";

describe("worker", () => {
	type Worker = {
		fetch: (init?: RequestInit) => Promise<Response>;
		stop: () => Promise<void>;
	};
	let workers: Worker[];

	beforeAll(async () => {
		//since the script is invoked from the directory above, need to specify index.js is in src/

		workers = await Promise.all([
			unstable_dev(
				"src/basicModule.ts",
				{ port: 31001 },
				{ disableExperimentalWarning: true }
			) as Worker,
			unstable_dev(
				"src/basicModule.ts",
				{ port: 31002 },
				{ disableExperimentalWarning: true }
			) as Worker,
			unstable_dev(
				"src/basicModule.ts",
				{ port: 31003 },
				{ disableExperimentalWarning: true }
			) as Worker,
			unstable_dev(
				"src/basicModule.ts",
				{ port: 31004 },
				{ disableExperimentalWarning: true }
			) as Worker,
			unstable_dev(
				"src/basicModule.ts",
				{ port: 31005 },
				{ disableExperimentalWarning: true }
			) as Worker,
			unstable_dev(
				"src/basicModule.ts",
				{ port: 31006 },
				{ disableExperimentalWarning: true }
			) as Worker,
			unstable_dev(
				"src/basicModule.ts",
				{ port: 31007 },
				{ disableExperimentalWarning: true }
			) as Worker,
			unstable_dev(
				"src/basicModule.ts",
				{ port: 31008 },
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

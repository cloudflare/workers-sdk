import path from "path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { unstable_startWorker } from "wrangler";

describe("multiple workers", () => {
	let workers: Awaited<ReturnType<typeof unstable_startWorker>>[];

	beforeAll(async () => {
		//since the script is invoked from the directory above, need to specify index.js is in src/

		workers = await Promise.all([
			unstable_startWorker({
				entrypoint: path.resolve(__dirname, "../src/module.ts"),
				dev: {
					server: { hostname: "127.0.0.1", port: 0 },
					inspector: false,
				},
			}),
			unstable_startWorker({
				entrypoint: path.resolve(__dirname, "../src/module.ts"),
				dev: {
					server: { hostname: "127.0.0.1", port: 0 },
					inspector: false,
				},
			}),
			unstable_startWorker({
				entrypoint: path.resolve(__dirname, "../src/module.ts"),
				dev: {
					server: { hostname: "127.0.0.1", port: 0 },
					inspector: false,
				},
			}),
		]);
	});

	afterAll(async () => {
		await Promise.all(workers.map(async (worker) => await worker.dispose()));
	});

	it.concurrent("all workers should be fetchable", async ({ expect }) => {
		const responses = await Promise.all(
			workers.map(async (worker) => await worker.fetch("http://example.com/"))
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

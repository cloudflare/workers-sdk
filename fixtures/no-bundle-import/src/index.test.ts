import getPort from "get-port";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

describe("Worker", () => {
	let worker: UnstableDevWorker;

	beforeAll(async () => {
		worker = await unstable_dev("src/index.js", {
			bundle: false,
			port: await getPort(),
			experimentalLocal: true,
		});
		console.error(worker);
	}, 30_000);

	afterAll(async () => {
		await worker.stop();
	});

	it("should respond without error, having collected modules", async () => {
		const resp = await worker.fetch();
		console.log(resp);
		if (resp) {
			const text = await resp.text();
			expect(text).toMatchInlineSnapshot(
				`"Hello Jane Smith and Hello John Smith"`
			);
		}
	});
});

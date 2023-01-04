import path from "path";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

describe("worker", () => {
	let worker: UnstableDevWorker;
	let resolveReadyPromise: (value: unknown) => void;
	const readyPromise = new Promise((resolve) => {
		resolveReadyPromise = resolve;
	});

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

		resolveReadyPromise(undefined);
	});

	afterAll(async () => {
		await readyPromise;
		await worker.stop();
	});

	it.concurrent("returns hex string", async () => {
		await readyPromise;
		const resp = await worker.fetch();
		expect(resp).not.toBe(undefined);

		const text = await resp.text();
		expect(text).toMatch("68656c6c6f");
	});
});

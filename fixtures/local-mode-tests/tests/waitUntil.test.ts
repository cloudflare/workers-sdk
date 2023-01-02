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
		//since the script is invoked from the directory above, need to specify index.js is in src/
		worker = await unstable_dev(
			path.resolve(__dirname, "..", "src", "basicWaitUntil.ts"),
			{
				config: path.resolve(__dirname, "..", "src", "wrangler.module.toml"),
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

	it.concurrent("renders", async () => {
		await readyPromise;
		const resp = await worker.fetch();
		expect(resp).not.toBe(undefined);

		const text = await resp.text();
		console.log("text: ", text);
		expect(text).not.toBe(undefined);
	});
});

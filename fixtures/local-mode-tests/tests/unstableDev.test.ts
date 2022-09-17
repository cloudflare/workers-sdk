import { join } from "node:path";
import { unstable_dev } from "wrangler";

describe("worker", () => {
	let worker: {
		fetch: (
			input?: RequestInfo,
			init?: RequestInit
		) => Promise<Response | undefined>;
		stop: () => Promise<void>;
	};
	let resolveReadyPromise: (value: unknown) => void;
	const readyPromise = new Promise((resolve) => {
		resolveReadyPromise = resolve;
	});

	beforeAll(async () => {
		//since the script is invoked from the directory above, need to specify index.js is in src/
		worker = await unstable_dev(
			join(__dirname, "../src/basicModule.ts"),
			{
				ip: "127.0.0.1",
				port: 1337,
			},
			{ disableExperimentalWarning: true }
		);
		resolveReadyPromise(null);
	});

	afterAll(async () => {
		await worker.stop();
	});

	it.concurrent("should invoke the worker and exit", async () => {
		await readyPromise;
		const resp = await worker.fetch();
		expect(resp).not.toBe(undefined);
		if (resp) {
			const text = await resp.text();

			expect(text).toMatchInlineSnapshot(`"Hello World!"`);
		}
	});
});

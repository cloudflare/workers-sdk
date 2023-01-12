import path from "path";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

// TODO: add test for `experimentalLocal: true` once issue with dynamic
//  `import()` and `npx-import` resolved:
//  https://github.com/cloudflare/wrangler2/pull/1940#issuecomment-1261166695
describe("worker in local mode", () => {
	let worker: UnstableDevWorker;
	let resolveReadyPromise: (value: unknown) => void;
	const readyPromise = new Promise((resolve) => {
		resolveReadyPromise = resolve;
	});

	beforeAll(async () => {
		//since the script is invoked from the directory above, need to specify index.js is in src/
		worker = await unstable_dev(
			path.resolve(__dirname, "..", "src", "basicModule.ts"),
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

	it.concurrent(
		"should invoke the worker and exit",
		async () => {
			await readyPromise;
			const resp = await worker.fetch();
			expect(resp).not.toBe(undefined);
			if (resp) {
				const text = await resp.text();

				expect(text).toMatchInlineSnapshot(`"Hello World!"`);
			}
		},
		10000
	);
});

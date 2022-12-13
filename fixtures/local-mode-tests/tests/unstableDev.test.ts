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
				ip: "127.0.0.1",
				port: 1337,
				local: true,
			},
			{ disableExperimentalWarning: true }
		);

		resolveReadyPromise(undefined);
	});

	afterAll(async () => {
		await readyPromise;
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

// skipping this test for now as it breaks tests in CI when the author isn't from Cloudflare
describe.skip("worker in remote mode", () => {
	let worker: UnstableDevWorker;
	let resolveReadyPromise: (value: unknown) => void;
	const readyPromise = new Promise((resolve) => {
		resolveReadyPromise = resolve;
	});

	beforeAll(async () => {
		if (process.env.TMP_CLOUDFLARE_API_TOKEN) {
			process.env.CLOUDFLARE_API_TOKEN = process.env.TMP_CLOUDFLARE_API_TOKEN;
		}

		if (process.env.TMP_CLOUDFLARE_ACCOUNT_ID) {
			process.env.CLOUDFLARE_ACCOUNT_ID = process.env.TMP_CLOUDFLARE_ACCOUNT_ID;
		}

		//since the script is invoked from the directory above, need to specify index.js is in src/
		worker = await unstable_dev(
			path.resolve(__dirname, "..", "src", "basicModule.ts"),
			{
				ip: "127.0.0.1",
				port: 1337,
				local: false,
			},
			{ disableExperimentalWarning: true }
		);

		resolveReadyPromise(undefined);
	});

	afterAll(async () => {
		await readyPromise;
		await worker.stop();
		process.env.CLOUDFLARE_API_TOKEN = undefined;
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

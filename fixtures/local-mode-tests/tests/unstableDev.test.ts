import { unstable_dev } from "wrangler";

// TODO: add test for `experimentalLocal: true` once issue with dynamic
//  `import()` and `npx-import` resolved:
//  https://github.com/cloudflare/wrangler2/pull/1940#issuecomment-1261166695
describe("worker in local mode", () => {
	let worker: {
		fetch: (
			input?: RequestInfo,
			init?: RequestInit
		) => Promise<Response | undefined>;
		stop: () => Promise<void>;
	};

	beforeAll(async () => {
		//since the script is invoked from the directory above, need to specify index.js is in src/
		worker = await unstable_dev(
			"src/basicModule.ts",
			{
				ip: "127.0.0.1",
				port: 1337,
				local: true,
			},
			{ disableExperimentalWarning: true }
		);
	});

	afterAll(async () => {
		await worker?.stop();
	});

	it("should invoke the worker and exit", async () => {
		const resp = await worker.fetch();
		expect(resp).not.toBe(undefined);
		if (resp) {
			const text = await resp.text();

			expect(text).toMatchInlineSnapshot(`"Hello World!"`);
		}
	});
});

describe("worker in remote mode", () => {
	let worker: {
		fetch: (
			input?: RequestInfo,
			init?: RequestInit
		) => Promise<Response | undefined>;
		stop: () => Promise<void>;
	};

	beforeAll(async () => {
		if (process.env.TMP_CLOUDFLARE_API_TOKEN) {
			process.env.CLOUDFLARE_API_TOKEN = process.env.TMP_CLOUDFLARE_API_TOKEN;
		}

		if (process.env.TMP_CLOUDFLARE_ACCOUNT_ID) {
			process.env.CLOUDFLARE_ACCOUNT_ID = process.env.TMP_CLOUDFLARE_ACCOUNT_ID;
		}

		//since the script is invoked from the directory above, need to specify index.js is in src/
		worker = await unstable_dev(
			"src/basicModule.ts",
			{
				ip: "127.0.0.1",
				port: 1337,
				local: false,
			},
			{ disableExperimentalWarning: true }
		);
	});

	afterAll(async () => {
		await worker?.stop();
		process.env.CLOUDFLARE_API_TOKEN = undefined;
	});

	it("should invoke the worker and exit", async () => {
		const resp = await worker.fetch();
		expect(resp).not.toBe(undefined);
		if (resp) {
			const text = await resp.text();

			expect(text).toMatchInlineSnapshot(`"Hello World!"`);
		}
	});
});

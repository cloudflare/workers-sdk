import { resolve } from "path";
import { unstable_dev } from "wrangler";

describe("worker", () => {
	let worker: {
		fetch: (input?: RequestInfo, init?: RequestInit) => Promise<Response>;
		stop: () => Promise<void>;
	};
	let resolveReadyPromise: (value: unknown) => void;
	const readyPromise = new Promise((resolve) => {
		resolveReadyPromise = resolve;
	});

	let originalNodeEnv: string | undefined;

	beforeAll(async () => {
		originalNodeEnv = process.env.NODE_ENV;

		process.env.NODE_ENV = "local-testing";

		//since the script is invoked from the directory above, need to specify index.js is in src/
		worker = await unstable_dev(
			resolve(__dirname, "..", "src", "sw.ts"),
			{
				config: resolve(__dirname, "..", "src", "wrangler.sw.toml"),
			},
			{ disableExperimentalWarning: true }
		);

		resolveReadyPromise(undefined);
	});

	afterAll(async () => {
		process.env.NODE_ENV = originalNodeEnv;

		await worker.stop();
	});

	it.concurrent("renders", async () => {
		await readyPromise;
		const resp = await worker.fetch();
		expect(resp).not.toBe(undefined);

		const text = await resp.text();
		expect(text).toMatchInlineSnapshot(`
    "{
      \\"VAR1\\": \\"value1\\",
      \\"VAR2\\": 123,
      \\"VAR3\\": {
        \\"abc\\": \\"def\\"
      },
      \\"text\\": \\"Here be some text\\",
      \\"data\\": \\"Here be some data\\",
      \\"TEXT\\": \\"Here be some text\\",
      \\"DATA\\": \\"Here be some data\\",
      \\"NODE_ENV\\": \\"local-testing\\"
    }"
  `);
	});
});

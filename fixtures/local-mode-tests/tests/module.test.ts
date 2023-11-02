import path from "path";
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

describe.skip("worker", () => {
	let worker: UnstableDevWorker;

	let originalNodeEnv: string | undefined;

	beforeAll(async () => {
		//since the script is invoked from the directory above, need to specify index.js is in src/
		originalNodeEnv = process.env.NODE_ENV;

		process.env.NODE_ENV = "local-testing";

		worker = await unstable_dev(
			path.resolve(__dirname, "..", "src", "module.ts"),
			{
				config: path.resolve(__dirname, "..", "src", "wrangler.module.toml"),
				vars: { VAR4: "https://google.com" },
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			}
		);
	});

	afterAll(async () => {
		await worker.stop();
		process.env.NODE_ENV = originalNodeEnv;
	});

	it("renders", async () => {
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
		  \\"VAR4\\": \\"https://google.com\\",
		  \\"text\\": \\"Here be some text\\",
		  \\"data\\": \\"Here be some data\\",
		  \\"NODE_ENV\\": \\"local-testing\\"
		}"
	`);
	});
});

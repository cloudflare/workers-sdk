import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

describe("service worker", () => {
	let worker: UnstableDevWorker;

	let originalNodeEnv: string | undefined;

	beforeAll(async () => {
		originalNodeEnv = process.env.NODE_ENV;

		process.env.NODE_ENV = "local-testing";

		//since the script is invoked from the directory above, need to specify index.js is in src/
		worker = await unstable_dev(path.resolve(__dirname, "..", "src", "sw.ts"), {
			config: path.resolve(__dirname, "..", "wrangler.sw.toml"),
			experimental: {
				disableExperimentalWarning: true,
			},
		});
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
			  "VAR1": "value1",
			  "VAR2": 123,
			  "VAR3": {
			    "abc": "def"
			  },
			  "text": "Here be some text",
			  "data": "Here be some data",
			  "TEXT": "Here be some text",
			  "DATA": "Here be some data",
			  "NODE_ENV": "local-testing"
			}"
		`);
	});
});

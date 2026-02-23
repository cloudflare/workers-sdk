import path from "path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { unstable_startWorker } from "wrangler";

describe("service worker", () => {
	let worker: Awaited<ReturnType<typeof unstable_startWorker>>;

	let originalNodeEnv: string | undefined;

	beforeAll(async () => {
		originalNodeEnv = process.env.NODE_ENV;

		process.env.NODE_ENV = "local-testing";

		//since the script is invoked from the directory above, need to specify index.js is in src/
		worker = await unstable_startWorker({
			entrypoint: path.resolve(__dirname, "../src/sw.ts"),
			config: path.resolve(__dirname, "../wrangler.sw.jsonc"),
			dev: {
				server: { hostname: "127.0.0.1", port: 0 },
				inspector: false,
			},
		});
	});

	afterAll(async () => {
		await worker.dispose();
		process.env.NODE_ENV = originalNodeEnv;
	});

	it("renders", async ({ expect }) => {
		const resp = await worker.fetch("http://example.com/");
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

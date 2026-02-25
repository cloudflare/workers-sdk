import path from "path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { unstable_startWorker } from "wrangler";

describe("module worker", () => {
	let worker: Awaited<ReturnType<typeof unstable_startWorker>>;

	let originalNodeEnv: string | undefined;

	beforeAll(async () => {
		//since the script is invoked from the directory above, need to specify index.js is in src/
		originalNodeEnv = process.env.NODE_ENV;

		process.env.NODE_ENV = "local-testing";

		worker = await unstable_startWorker({
			entrypoint: path.resolve(__dirname, "../src/module.ts"),
			config: path.resolve(__dirname, "../wrangler.module.jsonc"),
			bindings: {
				VAR4: { type: "plain_text", value: "https://google.com" },
			},
			dev: {
				server: { hostname: "127.0.0.1", port: 0 },
				inspector: false,
			},
		});
	});

	afterAll(async () => {
		try {
			await worker.dispose();
		} catch (e) {
			console.error("Failed to stop worker", e);
		}
		process.env.NODE_ENV = originalNodeEnv;
	});

	it("renders variables", async ({ expect }) => {
		const resp = await worker.fetch("http://example.com/vars");
		expect(resp).not.toBe(undefined);

		const text = await resp.text();
		expect(text).toMatchInlineSnapshot(`
			"{
			  "VAR1": "value1",
			  "VAR2": 123,
			  "VAR3": {
			    "abc": "def"
			  },
			  "VAR4": "https://google.com",
			  "text": "Here be some text",
			  "data": "Here be some data",
			  "NODE_ENV": "local-testing"
			}"
		`);
	});

	it("should return Hi by default", async ({ expect }) => {
		const resp = await worker.fetch("http://example.com/");
		expect(resp).not.toBe(undefined);
		const respJson = await resp.text();
		expect(respJson).toBe(JSON.stringify({ greeting: "Hi!" }));
	});
	it("should return Bonjour when French", async ({ expect }) => {
		const resp = await worker.fetch("http://example.com/", {
			headers: { lang: "fr-FR" },
		});
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Bonjour!" }));
		}
	});

	it("should return G'day when Australian", async ({ expect }) => {
		const resp = await worker.fetch("http://example.com/", {
			headers: { lang: "en-AU" },
		});
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "G'day!" }));
		}
	});

	it("should return Good day when British", async ({ expect }) => {
		const resp = await worker.fetch("http://example.com/", {
			headers: { lang: "en-GB" },
		});
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Good day!" }));
		}
	});

	it("should return Howdy when Texan", async ({ expect }) => {
		const resp = await worker.fetch("http://example.com/", {
			headers: { lang: "en-TX" },
		});
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Howdy!" }));
		}
	});

	it("should return Hello when American", async ({ expect }) => {
		const resp = await worker.fetch("http://example.com/", {
			headers: { lang: "en-US" },
		});
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Hello!" }));
		}
	});

	it("should return Hola when Spanish", async ({ expect }) => {
		const resp = await worker.fetch("http://example.com/", {
			headers: { lang: "es-ES" },
		});
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Hola!" }));
		}
	});

	it("returns hex string", async ({ expect }) => {
		const resp = await worker.fetch("http://example.com/buffer");
		expect(resp).not.toBe(undefined);

		const text = await resp.text();
		expect(text).toMatch("68656c6c6f");
	});
});

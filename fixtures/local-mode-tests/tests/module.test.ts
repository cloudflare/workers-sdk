import path from "path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { unstable_dev } from "wrangler";
import type { Unstable_DevWorker } from "wrangler";

describe("module worker", () => {
	let worker: Unstable_DevWorker;

	let originalNodeEnv: string | undefined;

	beforeAll(async () => {
		//since the script is invoked from the directory above, need to specify index.js is in src/
		originalNodeEnv = process.env.NODE_ENV;

		process.env.NODE_ENV = "local-testing";

		worker = await unstable_dev(
			path.resolve(__dirname, "..", "src", "module.ts"),
			{
				config: path.resolve(__dirname, "..", "wrangler.module.jsonc"),
				vars: { VAR4: "https://google.com" },
				ip: "127.0.0.1",
				port: 0,
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
					devEnv: true,
				},
			}
		);
	});

	afterAll(async () => {
		try {
			await worker.stop();
		} catch (e) {
			console.error("Failed to stop worker", e);
		}
		process.env.NODE_ENV = originalNodeEnv;
	});

	it("renders variables", async ({ expect }) => {
		const resp = await worker.fetch("/vars");
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
		const resp = await worker.fetch("/");
		expect(resp).not.toBe(undefined);
		const respJson = await resp.text();
		expect(respJson).toBe(JSON.stringify({ greeting: "Hi!" }));
	});
	it("should return Bonjour when French", async ({ expect }) => {
		const resp = await worker.fetch("/", { headers: { lang: "fr-FR" } });
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Bonjour!" }));
		}
	});

	it("should return G'day when Australian", async ({ expect }) => {
		const resp = await worker.fetch("/", { headers: { lang: "en-AU" } });
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "G'day!" }));
		}
	});

	it("should return Good day when British", async ({ expect }) => {
		const resp = await worker.fetch("/", { headers: { lang: "en-GB" } });
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Good day!" }));
		}
	});

	it("should return Howdy when Texan", async ({ expect }) => {
		const resp = await worker.fetch("/", { headers: { lang: "en-TX" } });
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Howdy!" }));
		}
	});

	it("should return Hello when American", async ({ expect }) => {
		const resp = await worker.fetch("/", { headers: { lang: "en-US" } });
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Hello!" }));
		}
	});

	it("should return Hola when Spanish", async ({ expect }) => {
		const resp = await worker.fetch("/", { headers: { lang: "es-ES" } });
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Hola!" }));
		}
	});

	it("returns hex string", async ({ expect }) => {
		const resp = await worker.fetch("/buffer");
		expect(resp).not.toBe(undefined);

		const text = await resp.text();
		expect(text).toMatch("68656c6c6f");
	});
});

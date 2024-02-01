import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

describe("module worker", () => {
	let worker: UnstableDevWorker;

	let originalNodeEnv: string | undefined;

	beforeAll(async () => {
		//since the script is invoked from the directory above, need to specify index.js is in src/
		originalNodeEnv = process.env.NODE_ENV;

		process.env.NODE_ENV = "local-testing";

		worker = await unstable_dev(
			path.resolve(__dirname, "..", "src", "module.ts"),
			{
				config: path.resolve(__dirname, "..", "wrangler.module.toml"),
				vars: { VAR4: "https://google.com" },
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
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

	it("renders variables", async () => {
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
	describe("header parsing", () => {
		it.concurrent("should return Hi by default", async () => {
			const resp = await worker.fetch("/");
			expect(resp).not.toBe(undefined);
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Hi!" }));
		});
		it.concurrent("should return Bonjour when French", async () => {
			const resp = await worker.fetch("/", { headers: { lang: "fr-FR" } });
			expect(resp).not.toBe(undefined);
			if (resp) {
				const respJson = await resp.text();
				expect(respJson).toBe(JSON.stringify({ greeting: "Bonjour!" }));
			}
		});

		it.concurrent("should return G'day when Australian", async () => {
			const resp = await worker.fetch("/", { headers: { lang: "en-AU" } });
			expect(resp).not.toBe(undefined);
			if (resp) {
				const respJson = await resp.text();
				expect(respJson).toBe(JSON.stringify({ greeting: "G'day!" }));
			}
		});

		it.concurrent("should return Good day when British", async () => {
			const resp = await worker.fetch("/", { headers: { lang: "en-GB" } });
			expect(resp).not.toBe(undefined);
			if (resp) {
				const respJson = await resp.text();
				expect(respJson).toBe(JSON.stringify({ greeting: "Good day!" }));
			}
		});

		it.concurrent("should return Howdy when Texan", async () => {
			const resp = await worker.fetch("/", { headers: { lang: "en-TX" } });
			expect(resp).not.toBe(undefined);
			if (resp) {
				const respJson = await resp.text();
				expect(respJson).toBe(JSON.stringify({ greeting: "Howdy!" }));
			}
		});

		it.concurrent("should return Hello when American", async () => {
			const resp = await worker.fetch("/", { headers: { lang: "en-US" } });
			expect(resp).not.toBe(undefined);
			if (resp) {
				const respJson = await resp.text();
				expect(respJson).toBe(JSON.stringify({ greeting: "Hello!" }));
			}
		});

		it.concurrent("should return Hola when Spanish", async () => {
			const resp = await worker.fetch("/", { headers: { lang: "es-ES" } });
			expect(resp).not.toBe(undefined);
			if (resp) {
				const respJson = await resp.text();
				expect(respJson).toBe(JSON.stringify({ greeting: "Hola!" }));
			}
		});
	});
	describe("buffer import", () => {
		it.concurrent("returns hex string", async () => {
			const resp = await worker.fetch("/buffer");
			expect(resp).not.toBe(undefined);

			const text = await resp.text();
			expect(text).toMatch("68656c6c6f");
		});
	});
});

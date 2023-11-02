import path from "path";
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

describe("worker", () => {
	let worker: UnstableDevWorker;

	beforeAll(async () => {
		worker = await unstable_dev(
			path.resolve(__dirname, "..", "src", "headers.ts"),
			{
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
				},
			}
		);
	});

	afterAll(async () => {
		await worker.stop();
	});

	it.concurrent("should return Hi by default", async () => {
		const resp = await worker.fetch("/");
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Hi!" }));
		}
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

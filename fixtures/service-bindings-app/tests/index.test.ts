import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_dev, UnstableDevWorker } from "wrangler";

describe("Service Bindings", () => {
	let aWorker: UnstableDevWorker;

	let bWorker: UnstableDevWorker;

	beforeAll(async () => {
		bWorker = await unstable_dev(path.join(__dirname, "../b/index.ts"), {
			config: path.join(__dirname, "../b/wrangler.toml"),
			experimental: {
				fileBasedRegistry: true,
				disableExperimentalWarning: true,
			},
		});
		await setTimeout(1000);
		aWorker = await unstable_dev(path.join(__dirname, "../a/index.ts"), {
			config: path.join(__dirname, "../a/wrangler.toml"),
			experimental: {
				fileBasedRegistry: true,
				disableExperimentalWarning: true,
			},
		});
		await setTimeout(1000);
	});

	it("connects up Durable Objects and keeps state across wrangler instances", async () => {
		const responseA = await aWorker.fetch(`https://example.com/`);
		const textA = await responseA.text();
		expect(textA).toEqual("hello world");

		const responseB = await bWorker.fetch(`/`);
		const textB = await responseB.text();
		expect(textB).toEqual("hello world");
	});

	it("gives facade service workers a constructor name of Fetcher", async () => {
		const responseA = await aWorker.fetch(`/constructor`);
		const textA = await responseA.text();
		expect(textA).toEqual("Fetcher");
	});
	afterAll(async () => {
		await aWorker?.stop();
		await bWorker?.stop();
	});
});

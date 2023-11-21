import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { UnstableDevWorker, unstable_dev } from "wrangler";
import path from "node:path";

// TODO: reenable when https://github.com/cloudflare/workers-sdk/pull/4241 lands
// and improves reliability of this test.
describe.skip("Service Bindings", () => {
	let aWorker: UnstableDevWorker;

	let bWorker: UnstableDevWorker;

	beforeAll(async () => {
		bWorker = await unstable_dev(path.join(__dirname, "../b/index.ts"), {
			config: path.join(__dirname, "../b/wrangler.toml"),
		});
		aWorker = await unstable_dev(path.join(__dirname, "../a/index.ts"), {
			config: path.join(__dirname, "../a/wrangler.toml"),
		});
		// Service registry is polled every 300ms,
		// so let's give worker A some time to find B

		await new Promise((resolve) => setTimeout(resolve, 700));
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

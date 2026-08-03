import { setTimeout as sleep } from "node:timers/promises";
import { resolve } from "path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createTestHarness } from "wrangler";

const basePath = resolve(__dirname, "..");
const server = createTestHarness({
	root: basePath,
	workers: [{ configPath: "wrangler.jsonc" }],
});

/**
 * Both bindings use a 60s period. Miniflare buckets requests into fixed
 * windows aligned to the wall clock and clears every counter on rollover, so a
 * burst that straddles a boundary has its count reset part way through and the
 * final request is no longer rejected. Wait out the tail of the current window
 * so each burst is guaranteed to run inside a single one.
 */
async function waitForFreshRateLimitWindow() {
	const periodMs = 60 * 1000;
	const remainingMs = periodMs - (Date.now() % periodMs);
	if (remainingMs < 10_000) {
		await sleep(remainingMs + 50);
	}
}

describe("Rate limiting bindings", () => {
	beforeAll(async () => {
		await server.listen();
	});

	afterAll(async () => {
		await server.close();
	});

	it("ratelimit binding is defined ", async ({ expect }) => {
		await waitForFreshRateLimitWindow();

		let response = await server.fetch("/");
		let content = await response.text();
		expect(content).toEqual("Success");

		response = await server.fetch("/");
		content = await response.text();
		expect(content).toEqual("Success");

		response = await server.fetch("/");
		content = await response.text();
		expect(content).toEqual("Success");

		response = await server.fetch("/");
		content = await response.text();
		expect(content).toEqual("Slow down");
	});

	it("ratelimit unsafe binding is defined ", async ({ expect }) => {
		await waitForFreshRateLimitWindow();

		let response = await server.fetch("/unsafe");
		let content = await response.text();
		expect(content).toEqual("unsafe: Success");

		response = await server.fetch("/unsafe");
		content = await response.text();
		expect(content).toEqual("unsafe: Success");

		response = await server.fetch("/unsafe");
		content = await response.text();
		expect(content).toEqual("unsafe: Slow down");
	});
});

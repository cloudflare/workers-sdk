import { afterAll, beforeAll, describe, test, vi } from "vitest";
import { createTestHarness } from "wrangler";

const server = createTestHarness({
	workers: [{ configPath: "./wrangler.jsonc" }],
});

describe("container app", () => {
	beforeAll(async () => {
		await server.listen();
	});

	afterAll(async () => {
		await server.close();
	});

	test("starts and fetches from the container", async ({ expect }) => {
		const statusResponse = await server.fetch("/status");
		expect(await statusResponse.json()).toBe(false);

		const startResponse = await server.fetch("/start");
		expect(await startResponse.text()).toBe("Container create request sent...");

		await vi.waitFor(async () => {
			const fetchResponse = await server.fetch("/fetch");
			expect(await fetchResponse.text()).toBe(
				"Hello World! Have an env var! I'm an env var!"
			);
		});
	});
});

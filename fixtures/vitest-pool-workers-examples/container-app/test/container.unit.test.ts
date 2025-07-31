import { env } from "cloudflare:test";
import { expect, it, vi } from "vitest";

it("dispatches fetch event", { timeout: 10000 }, async () => {
	const id = env.MY_CONTAINER.idFromName("helloagain");
	const stub = env.MY_CONTAINER.get(id);
	await vi.waitFor(
		async () => {
			const response = await stub.fetch("http://example.com/container/hello", {
				signal: AbortSignal.timeout(500),
			});
			expect(await response.text()).toBe(
				"Hello World! Have an env var! I was passed in via the container class!"
			);
		},
		{ timeout: 10_000 }
	);
});

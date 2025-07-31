import { SELF } from "cloudflare:test";
import { expect, it, vi } from "vitest";

it("dispatches fetch event", { timeout: 10_000 }, async () => {
	await vi.waitFor(
		async () => {
			const response = await SELF.fetch("http://example.com/container/hello", {
				signal: AbortSignal.timeout(500),
			});
			expect(await response.text()).toBe(
				"Hello World! Have an env var! I was passed in via the container class!"
			);
		},
		{ timeout: 10_000 }
	);
});

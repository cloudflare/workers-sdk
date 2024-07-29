import { env } from "cloudflare:test";
import { expect, it } from "vitest";

it("dispatches fetch event", async () => {
	const response = await env.WORKER.fetch("http://example.com");
	expect(await response.text()).toBe("👋");
});

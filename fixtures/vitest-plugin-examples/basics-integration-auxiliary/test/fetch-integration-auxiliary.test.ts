import { env } from "cloudflare:workers";
import { it } from "vitest";

it("dispatches fetch event", async ({ expect }) => {
	const response = await env.WORKER.fetch("http://example.com");
	expect(await response.text()).toBe("👋");
});

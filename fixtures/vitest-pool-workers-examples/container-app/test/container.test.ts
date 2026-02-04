import { env, runDurableObjectAlarm, SELF } from "cloudflare:test";
import { it, vi } from "vitest";

it("dispatches fetch event", { timeout: 10_000 }, async ({ expect }) => {
	// requests to code paths that do not interact with a container should work fine
	const res = await SELF.fetch("http://example.com/");
	expect(await res.text()).toMatchInlineSnapshot(`
		"Call /container to start a container with a 10s timeout.
		Call /error to start a container that errors
		Call /lb to test load balancing"
	`);
	// however if you attempt to start a container, you should expect an error
	await expect(
		SELF.fetch("http://example.com/container/hello")
	).rejects.toThrow();
});

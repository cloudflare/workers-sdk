import { env } from "cloudflare:test";
import { expect, it } from "vitest";

it("dispatches scheduled event", async () => {
	// Note the `Fetcher#scheduled()` method is experimental, and requires the
	// `service_binding_extra_handlers` compatibility flag to be enabled.
	const result = await env.WORKER.scheduled({
		scheduledTime: new Date(1000),
		cron: "30 * * * *",
	});
	expect(result.outcome).toBe("ok");
});

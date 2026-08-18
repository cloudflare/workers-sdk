import { exports } from "cloudflare:workers";
import { it } from "vitest";

it("dispatches scheduled event", async ({ expect }) => {
	// `exports.default` here points to the worker running in the current isolate.
	// This gets its handler from the `main` option in `vitest.config.mts`.
	// Importantly, it uses the exact `import("../src").default` instance we could
	// import in this file as its handler. Note the `exports.default.scheduled()` method
	// is experimental, and requires the `service_binding_extra_handlers`
	// compatibility flag to be enabled.
	const result = await exports.default.scheduled({
		scheduledTime: new Date(1000),
		cron: "30 * * * *",
	});
	expect(result.outcome).toBe("ok");
});

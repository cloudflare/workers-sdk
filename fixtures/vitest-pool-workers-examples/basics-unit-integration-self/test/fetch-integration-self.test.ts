import { exports } from "cloudflare:workers";
import { it } from "vitest";

it("dispatches fetch event", async ({ expect }) => {
	// `exports.default` here points to the worker running in the current isolate.
	// This gets its handler from the `main` option in `vitest.config.mts`.
	// Importantly, it uses the exact `import("../src").default` instance we could
	// import in this file as its handler.
	const response = await exports.default.fetch("http://example.com");
	expect(await response.text()).toBe("👋 http://example.com/");
});

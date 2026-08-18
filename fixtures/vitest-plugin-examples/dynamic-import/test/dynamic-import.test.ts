import { env } from "cloudflare:workers";
import { exports } from "cloudflare:workers";
import { it } from "vitest";

// Regression test for https://github.com/cloudflare/workers-sdk/issues/12924
//
// Calling exports.default.fetch() on a worker whose fetch handler uses a
// dynamic import() would hang with "Cannot perform I/O on behalf of a
// different Durable Object". Pre-loading the module (e.g. via a static
// import of the worker) masks the bug by caching the module.
it("exports.default.fetch() with dynamic import()", async ({ expect }) => {
	const response = await exports.default.fetch(
		new Request("https://example.com/")
	);
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("Hello, World!");
});

// Regression test for https://github.com/cloudflare/workers-sdk/issues/5387
//
// Dynamic import() inside a Durable Object fetch handler has the same
// cross-context I/O violation when the module isn't already cached.
it("Durable Object fetch with dynamic import()", async ({ expect }) => {
	const id = env.GREETER.idFromName("test");
	const stub = env.GREETER.get(id);
	const response = await stub.fetch(new Request("https://example.com/"));
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("Hello, DO!");
});

import { Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose } from "./test-shared";

// `dispatchFetch()` pools the runtime connection to `workerd` (the dispatcher
// sets `reset = false`), and `workerd` closes idle runtime connections. If the
// embedding process blocks its event loop past that idle timeout, the close is
// never processed, so the dead socket stays in the pool and the next
// `dispatchFetch()` is dispatched on it and fails with `UND_ERR_SOCKET` /
// `ECONNRESET`. See https://github.com/cloudflare/workers-sdk/issues/16243.
test(
	"dispatchFetch: does not reuse a runtime connection that workerd has closed",
	async ({ expect }) => {
		const mf = new Miniflare({
			workers: [
				{
					config: {
						name: "",
						compatibilityDate: "2026-09-07",
						manifest: singleModuleManifest(
							`export default { fetch() { return new Response("ok"); } }`
						),
					},
				},
			],
		});
		useDispose(mf);

		const first = await mf.dispatchFetch("http://local.test/");
		expect(await first.text()).toBe("ok");

		// Block the event loop past `workerd`'s idle connection timeout (the
		// socket is FINed but the close event is never processed), as a test
		// runner doing synchronous work between requests would.
		const start = performance.now();
		while (performance.now() - start < 25_000) {}

		// This must not be dispatched on the pooled socket `workerd` has
		// already closed, and must not fail with a transport error.
		const second = await mf.dispatchFetch("http://local.test/", {
			method: "POST",
			body: "x",
		});
		expect(await second.text()).toBe("ok");
	},
	60_000
);

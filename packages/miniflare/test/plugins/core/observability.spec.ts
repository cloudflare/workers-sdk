import { Miniflare, type WorkerOptions } from "miniflare";
import { describe, test } from "vitest";
import { useDispose } from "../../test-shared";

// Local observability (experimental) — wiring only.
//
// When `unsafeObservability` is enabled, Miniflare core itself attaches the
// internal collector as a streaming-tail consumer of each user worker (plus the
// compat flags workerd needs to emit that tail). The caller wires nothing
// per-worker — that's the whole point (wrangler and the Vite plugin just flip the
// single option). The collector is a placeholder for now; capturing and
// persisting traces lands in a follow-up, so these tests assert the auto-wiring
// produces a valid, working config rather than asserting on captured data.

function plainWorker(script: string): WorkerOptions {
	return {
		name: "user",
		modules: true,
		compatibilityDate: "2026-06-01",
		script,
	};
}

describe("unsafeObservability (wiring)", () => {
	test("auto-wires a plain worker, which still boots and serves", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			unsafeObservability: true,
			workers: [
				plainWorker(
					`export default { async fetch() { return new Response("ok"); } }`
				),
			],
		});
		useDispose(mf);

		// A broken injection (bad collector service reference or invalid compat
		// flags on the user worker) would fail to start workerd or to serve.
		const res = await mf.dispatchFetch("http://localhost/");
		expect(await res.text()).toBe("ok");
	});

	test("is a no-op when disabled — worker boots and serves normally", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			workers: [
				plainWorker(
					`export default { async fetch() { return new Response("ok"); } }`
				),
			],
		});
		useDispose(mf);

		const res = await mf.dispatchFetch("http://localhost/");
		expect(await res.text()).toBe("ok");
	});
});

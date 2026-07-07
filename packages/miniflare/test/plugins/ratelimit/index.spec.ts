import { Miniflare } from "miniflare";
import { test } from "vitest";
import { useDispose } from "../../test-shared";

test("ratelimit", async ({ expect }) => {
	const mf = new Miniflare({
		ratelimits: {
			TESTRATE: {
				namespace_id: "test-namespace",
				simple: {
					limit: 2,
					period: 60,
				},
			},
		},

		modules: true,
		script: `
		export default {
			async fetch(request, env, ctx) {
				const { success } = await env.TESTRATE.limit({
					key: "test",
				});
				if (!success) {
					return new Response("rate limited", { status: 429 });
				}
				return new Response("success", { status: 200 });
			},
		}
		`,
	});
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost");
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("success");
	res = await mf.dispatchFetch("http://localhost");
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("success");

	res = await mf.dispatchFetch("http://localhost");
	expect(res.status).toBe(429);
	expect(await res.text()).toBe("rate limited");
});

test("ratelimit validation", async ({ expect }) => {
	const mf = new Miniflare({
		ratelimits: {
			TESTRATE: {
				namespace_id: "test-namespace",
				simple: {
					limit: 2,
					period: 60,
				},
			},
		},

		modules: true,
		script: `
		export default {
			async fetch(request, env, ctx) {
				const options = await request.json()
				try {
					const { success } = await env.TESTRATE.limit(options);
				} catch (e) {
					return new Response(e, {status: 200})
				}
				return new Response("should have resulted in error", { status: 500 });
			},
		}
		`,
	});
	useDispose(mf);

	const TESTS = [
		{
			options: "invalid",
			error: "Error: invalid rate limit options",
		},
		{
			options: { invalid: "foo" },
			error: "Error: bad rate limit options: [invalid]",
		},
		{
			options: { limit: "bad" },
			error: "Error: limit must be a number: bad",
		},
		{
			options: { period: "bad" },
			error: "Error: period must be a number: bad",
		},
		{
			options: { period: 1 },
			error: "Error: unsupported period: 1",
		},
	];

	for (const { options, error } of TESTS) {
		const body = JSON.stringify(options);
		const res = await mf.dispatchFetch("http://localhost", {
			method: "POST",
			body,
		});
		// Bad status for [${body}]
		expect(res.status).toBe(200);
		// Mismatched error for [${body}]
		expect(await res.text()).toBe(error);
	}
});

test("ratelimit counters are keyed by namespace_id", async ({ expect }) => {
	const mf = new Miniflare({
		ratelimits: {
			// Two bindings sharing a namespace_id must share a single counter...
			RATE_A: {
				namespace_id: "shared",
				simple: { limit: 2, period: 60 },
			},
			RATE_B: {
				namespace_id: "shared",
				simple: { limit: 2, period: 60 },
			},
			// ...while a distinct namespace_id stays isolated.
			RATE_C: {
				namespace_id: "other",
				simple: { limit: 2, period: 60 },
			},
		},

		modules: true,
		script: `
		export default {
			async fetch(request, env, ctx) {
				const binding = new URL(request.url).searchParams.get("b");
				const { success } = await env[binding].limit({ key: "k" });
				return new Response(success ? "ok" : "limited", {
					status: success ? 200 : 429,
				});
			},
		}
		`,
	});
	useDispose(mf);

	const call = async (b: string) => {
		const res = await mf.dispatchFetch(`http://localhost?b=${b}`);
		await res.text();
		return res.status;
	};

	// RATE_A and RATE_B share the "shared" namespace, so they increment the same
	// counter: two successes across the pair, then the third call is limited.
	expect(await call("RATE_A")).toBe(200);
	expect(await call("RATE_B")).toBe(200);
	expect(await call("RATE_A")).toBe(429);
	expect(await call("RATE_B")).toBe(429);

	// RATE_C is a different namespace, so its counter is untouched.
	expect(await call("RATE_C")).toBe(200);
	expect(await call("RATE_C")).toBe(200);
	expect(await call("RATE_C")).toBe(429);
});

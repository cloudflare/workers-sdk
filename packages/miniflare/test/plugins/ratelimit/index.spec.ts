import { Miniflare } from "miniflare";
import { expect, test } from "vitest";
import { useDispose } from "../../test-shared";

test("ratelimit", async () => {
	const mf = new Miniflare({
		ratelimits: {
			TESTRATE: {
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

test("ratelimit validation", async () => {
	const mf = new Miniflare({
		ratelimits: {
			TESTRATE: {
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

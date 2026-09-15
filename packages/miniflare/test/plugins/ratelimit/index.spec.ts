import fs from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { Miniflare, RATELIMIT_PLUGIN_NAME } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type { MiniflareOptions } from "miniflare";

/**
 * The emulated rate limiter buckets requests into fixed windows aligned to the
 * wall clock (`Math.floor(Date.now() / (period * 1000))`, see
 * `src/workers/ratelimit/ratelimit-object.worker.ts`) and resets a counter when
 * its window rolls over.
 *
 * A burst that straddles a boundary therefore has its count reset part way
 * through, so a test sending `limit + 1` requests and expecting the last to be
 * rejected fails whenever the boundary lands mid-burst. Await this first: it
 * returns immediately unless one of the current windows is nearly over, in
 * which case it waits for the next one so the burst runs inside a single window
 * of every period it was given.
 */
async function waitForFreshRateLimitWindow(
	periodsSeconds: number[],
	minRemainingMs = 10_000
) {
	const remaining = () =>
		Math.min(
			...periodsSeconds.map((periodSeconds) => {
				const periodMs = periodSeconds * 1000;
				return periodMs - (Date.now() % periodMs);
			})
		);
	// A window can never offer more headroom than its own length, so asking for
	// more than the shortest period would never be satisfied.
	const targetMs = Math.min(
		minRemainingMs,
		(Math.min(...periodsSeconds) * 1000) / 2
	);
	// Periods divide one another, so skipping past the closest boundary realigns
	// all of them at once and this loop runs at most twice.
	let remainingMs = remaining();
	while (remainingMs < targetMs) {
		// Overshoot slightly so the next request is unambiguously in the new window.
		await sleep(remainingMs + 50);
		remainingMs = remaining();
	}
}

type RateLimitEnv = NonNullable<
	MiniflareOptions["workers"][number]["config"]["env"]
>;

function createRateLimitOptions(options: {
	env?: RateLimitEnv;
	script: string;
	resourcePersistencePath?: string;
}): MiniflareOptions {
	return {
		...(options.resourcePersistencePath
			? { resourcePersistencePath: options.resourcePersistencePath }
			: {}),
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					...(options.env ? { env: options.env } : {}),
					manifest: singleModuleManifest(options.script),
				},
			},
		],
	};
}

test("ratelimit", async ({ expect }) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					env: {
						TESTRATE: {
							type: "rate-limit",
							namespace: "test-namespace",
							simple: {
								limit: 2,
								period: 60,
							},
						},
					},
					manifest: singleModuleManifest(`
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
		`),
				},
			},
		],
	});
	useDispose(mf);

	await waitForFreshRateLimitWindow([60]);

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
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					env: {
						TESTRATE: {
							type: "rate-limit",
							namespace: "test-namespace",
							simple: {
								limit: 2,
								period: 60,
							},
						},
					},
					manifest: singleModuleManifest(`
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
		`),
				},
			},
		],
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
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					env: {
						// Two bindings sharing a namespace must share a single counter...
						RATE_A: {
							type: "rate-limit",
							namespace: "shared",
							simple: { limit: 2, period: 60 },
						},
						RATE_B: {
							type: "rate-limit",
							namespace: "shared",
							simple: { limit: 2, period: 60 },
						},
						// ...while a distinct namespace stays isolated.
						RATE_C: {
							type: "rate-limit",
							namespace: "other",
							simple: { limit: 2, period: 60 },
						},
					},
					manifest: singleModuleManifest(`
		export default {
			async fetch(request, env, ctx) {
				const binding = new URL(request.url).searchParams.get("b");
				const { success } = await env[binding].limit({ key: "k" });
				return new Response(success ? "ok" : "limited", {
					status: success ? 200 : 429,
				});
			},
		}
		`),
				},
			},
		],
	});
	useDispose(mf);

	const call = async (b: string) => {
		const res = await mf.dispatchFetch(`http://localhost?b=${b}`);
		await res.text();
		return res.status;
	};

	await waitForFreshRateLimitWindow([60]);

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

test("ratelimit counters are scoped per period", async ({ expect }) => {
	const mf = new Miniflare(
		createRateLimitOptions({
			env: {
				// Same namespace, different windows. Production identifies a counter by
				// bucket index and bucket start timestamp, both derived from the period,
				// so these two must not share (nor clobber) a counter.
				RATE_SLOW: {
					type: "rate-limit",
					namespace: "shared",
					simple: { limit: 1, period: 60 },
				},
				RATE_FAST: {
					type: "rate-limit",
					namespace: "shared",
					simple: { limit: 1, period: 10 },
				},
			},
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
		})
	);
	useDispose(mf);

	const call = async (b: string) => {
		const res = await mf.dispatchFetch(`http://localhost?b=${b}`);
		await res.text();
		return res.status;
	};

	await waitForFreshRateLimitWindow([10, 60], 3_000);

	expect(await call("RATE_SLOW")).toBe(200);
	expect(await call("RATE_FAST")).toBe(200);

	// The discriminating assertion: if the period weren't part of the counter's
	// identity, RATE_FAST's call would have replaced RATE_SLOW's row with an
	// epoch RATE_SLOW can never match, so RATE_SLOW would start from zero again
	// here — and by symmetry neither binding would ever limit anything.
	expect(await call("RATE_SLOW")).toBe(429);
	expect(await call("RATE_FAST")).toBe(429);
});

test("ratelimit counters survive a workerd restart", async ({ expect }) => {
	const options = createRateLimitOptions({
		env: {
			TESTRATE: {
				type: "rate-limit",
				namespace: "restart",
				simple: { limit: 1, period: 60 },
			},
		},
		script: `
		export default {
			async fetch(request, env, ctx) {
				const { success } = await env.TESTRATE.limit({ key: "k" });
				return new Response(success ? "ok" : "limited", {
					status: success ? 200 : 429,
				});
			},
		}
		`,
	});

	const mf = new Miniflare(options);
	useDispose(mf);

	const call = async () => {
		const res = await mf.dispatchFetch("http://localhost");
		await res.text();
		return res.status;
	};

	await waitForFreshRateLimitWindow([60]);

	expect(await call()).toBe(200);

	// `setOptions()` restarts `workerd`, tearing down every Durable Object. This
	// is a strictly stronger teardown than the ~10s idle eviction that used to
	// silently reset the counters, so it proves the state is durable.
	await mf.setOptions(options);

	expect(await call()).toBe(429);
});

test("ratelimit persists on file-system", async ({ expect }) => {
	const tmp = await useTmp();
	const options = createRateLimitOptions({
		env: {
			TESTRATE: {
				type: "rate-limit",
				namespace: "persist",
				simple: { limit: 1, period: 60 },
			},
		},
		resourcePersistencePath: tmp,
		script: `
		export default {
			async fetch(request, env, ctx) {
				const { success } = await env.TESTRATE.limit({ key: "k" });
				return new Response(success ? "ok" : "limited", {
					status: success ? 200 : 429,
				});
			},
		}
		`,
	});

	const call = async (mf: Miniflare) => {
		const res = await mf.dispatchFetch("http://localhost");
		await res.text();
		return res.status;
	};

	await waitForFreshRateLimitWindow([60]);

	let mf = new Miniflare(options);
	useDispose(mf);
	expect(await call(mf)).toBe(200);

	const names = await fs.readdir(tmp);
	expect(names.includes(RATELIMIT_PLUGIN_NAME)).toBe(true);

	// A whole new Miniflare instance, as after restarting `wrangler dev`: the
	// window hasn't rolled over, so the limit must still be exhausted.
	await mf.dispose();
	mf = new Miniflare(options);
	useDispose(mf);
	expect(await call(mf)).toBe(429);
});

test("ratelimit creates no storage directory when unconfigured", async ({
	expect,
}) => {
	const tmp = await useTmp();
	const mf = new Miniflare(
		createRateLimitOptions({
			resourcePersistencePath: tmp,
			script: `export default { fetch: () => new Response("ok") }`,
		})
	);
	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("ok");

	const names = await fs.readdir(tmp);
	expect(names.includes(RATELIMIT_PLUGIN_NAME)).toBe(false);
});

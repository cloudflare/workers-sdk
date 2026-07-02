import {
	OBSERVABILITY_COLLECTOR_SERVICE_NAME,
	OBSERVABILITY_D1_BINDING,
	OBSERVABILITY_D1_ID,
} from "@cloudflare/workers-utils";
import { Miniflare, type WorkerOptions } from "miniflare";
import { describe, test } from "vitest";
import { useDispose } from "../../test-shared";

// These tests exercise the experimental local-observability capability at the
// Miniflare-core level: when `unsafeObservability` is enabled and a user worker
// streams its tail to the collector, traces/spans/logs are captured and
// persisted to the internal WOBS_TRACES D1 store. This mirrors what
// `wrangler dev` / the Vite plugin wire up automatically when
// X_LOCAL_OBSERVABILITY is set.

const COMPAT_FLAGS = ["streaming_tail_worker", "tail_worker_user_spans"];

/** A user worker wired to the collector, like the dev layer does. */
function observedWorker(script: string): WorkerOptions {
	return {
		name: "user",
		modules: true,
		compatibilityDate: "2026-06-01",
		compatibilityFlags: COMPAT_FLAGS,
		script,
		kvNamespaces: { CACHE: "cache-namespace" },
		d1Databases: { [OBSERVABILITY_D1_BINDING]: { id: OBSERVABILITY_D1_ID } },
		streamingTails: [{ name: OBSERVABILITY_COLLECTOR_SERVICE_NAME }],
	};
}

/** Wait for the collector's waitUntil-driven persist to flush. */
async function flush() {
	await new Promise((resolve) => setTimeout(resolve, 1000));
}

describe("unsafeObservability", () => {
	test("captures and persists a worker's trace, spans, and logs", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			unsafeObservability: true,
			workers: [
				observedWorker(`export default {
					async fetch(request, env) {
						await env.CACHE.get("some-key");
						console.log("handled request");
						return new Response("ok");
					},
				}`),
			],
		});
		useDispose(mf);

		const res = await mf.dispatchFetch("http://localhost/orders");
		expect(await res.text()).toBe("ok");
		await flush();

		const db = await mf.getD1Database(OBSERVABILITY_D1_BINDING);

		const traces = await db
			.prepare("SELECT name, span_count, outcome FROM traces")
			.all<{ name: string; span_count: number; outcome: string }>();
		expect(traces.results.length).toBeGreaterThan(0);
		// root + KV span (at least), so more than one span captured
		expect(traces.results[0].span_count).toBeGreaterThan(1);

		// the KV read should have been captured as a span
		const kvSpans = await db
			.prepare("SELECT kind FROM spans WHERE kind = 'kv'")
			.all();
		expect(kvSpans.results.length).toBeGreaterThan(0);

		// the console.log should have been captured as a log event
		const logs = await db
			.prepare("SELECT level, message FROM logs")
			.all<{ level: string; message: string }>();
		expect(logs.results.length).toBeGreaterThan(0);
		expect(logs.results[0].message).toContain("handled request");

		// the root span should carry the enriched onset/outcome attributes that the
		// production streaming-tail worker ingests (trigger type, method, cpu/wall)
		const root = await db
			.prepare(
				"SELECT attributes FROM spans WHERE trace_id = (SELECT trace_id FROM traces LIMIT 1) AND span_id = (SELECT root_span_id FROM traces LIMIT 1)"
			)
			.first<{ attributes: string }>();
		const attrs = JSON.parse(root?.attributes ?? "{}");
		expect(attrs["faas.trigger"]).toBe("http");
		expect(attrs["http.request.method"]).toBe("GET");
		expect(attrs["cloudflare.outcome"]).toBe("ok");
		expect(typeof attrs["cpu_time_ms"]).toBe("number");
		expect(typeof attrs["wall_time_ms"]).toBe("number");
	});

	test("links child spans to the root span via parent_id", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			unsafeObservability: true,
			workers: [
				observedWorker(`export default {
					async fetch(request, env) {
						await env.CACHE.get("k");
						return new Response("ok");
					},
				}`),
			],
		});
		useDispose(mf);

		const res = await mf.dispatchFetch("http://localhost/");
		await res.text();
		await flush();

		const db = await mf.getD1Database(OBSERVABILITY_D1_BINDING);
		const trace = await db
			.prepare("SELECT trace_id, root_span_id FROM traces LIMIT 1")
			.first<{ trace_id: string; root_span_id: string }>();
		expect(trace).not.toBeNull();

		const kvSpan = await db
			.prepare("SELECT parent_id FROM spans WHERE kind = 'kv' LIMIT 1")
			.first<{ parent_id: string | null }>();
		// the KV span's parent should be the request's root span
		expect(kvSpan?.parent_id).toBe(trace?.root_span_id);
	});

	test("captures an uncaught exception on the trace", async ({ expect }) => {
		const mf = new Miniflare({
			unsafeObservability: true,
			workers: [
				observedWorker(`export default {
					async fetch() {
						throw new Error("boom-kaboom");
					},
				}`),
			],
		});
		useDispose(mf);

		// the worker throws -> workerd returns a 500, but the trace should still
		// persist. Consume the body so Miniflare doesn't complain.
		const res = await mf.dispatchFetch("http://localhost/");
		await res.text();
		await flush();

		const db = await mf.getD1Database(OBSERVABILITY_D1_BINDING);
		const trace = await db
			.prepare("SELECT outcome, error FROM traces LIMIT 1")
			.first<{ outcome: string | null; error: string | null }>();
		expect(trace).not.toBeNull();
		// either the error message was captured, or the outcome is non-ok
		const erred =
			(trace?.error?.includes("boom-kaboom") ?? false) ||
			(trace?.outcome != null && trace.outcome !== "ok");
		expect(erred).toBe(true);
	});

	// Note: the "disabled" path (collector only injected behind the flag) is
	// covered by the wrangler/Vite wiring tests, which assert the dev layer only
	// adds the streamingTail + D1 + flags when X_LOCAL_OBSERVABILITY is set.
});

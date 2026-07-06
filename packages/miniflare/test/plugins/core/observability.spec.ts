import assert from "node:assert";
import { OBSERVABILITY_COLLECTOR_SERVICE_NAME } from "@cloudflare/workers-utils";
import { Miniflare, type WorkerOptions } from "miniflare";
import { describe, test } from "vitest";
import { useDispose } from "../../test-shared";

// Local observability (experimental).
//
// When `unsafeObservability` is enabled, Miniflare core itself attaches the
// internal collector as a streaming-tail consumer of each user worker (plus the
// compat flags workerd needs to emit that tail). The caller wires nothing
// per-worker — that's the whole point (wrangler and the Vite plugin just flip the
// single option). Capture (folding the TailStream into spans/logs) is still a
// no-op placeholder here; the wiring tests below assert the auto-wiring produces
// a valid, working config, and the store tests exercise the internal `TraceStore`
// Durable Object + the collector's read API directly (via RPC), independent of
// capture.

function plainWorker(script: string): WorkerOptions {
	return {
		name: "user",
		modules: true,
		compatibilityDate: "2026-06-01",
		script,
	};
}

// The store's only read surface is `POST /query` (read-only SQL); the harnesses
// proxy `/wobs/*` to the collector. These are the canned queries the UI ships,
// exercised here to prove capture wrote what we expect.
const TRACE_LIST_SQL = `SELECT trace_id, span_id, service, name, kind, start_ms, duration_ms, outcome,
	(SELECT COUNT(*) FROM spans s2 WHERE s2.trace_id = spans.trace_id) AS span_count,
	(SELECT COUNT(*) FROM spans s3 WHERE s3.trace_id = spans.trace_id AND s3.error IS NOT NULL) AS error_count,
	(SELECT COUNT(DISTINCT s4.service) FROM spans s4 WHERE s4.trace_id = spans.trace_id AND s4.service IS NOT NULL) AS service_count
	FROM spans WHERE parent_id IS NULL ORDER BY start_ms DESC`;
const TRACE_SPANS_SQL = `SELECT trace_id, span_id, parent_id, service, name, kind, start_ms, duration_ms, outcome, error, json(attributes) AS attributes
	FROM spans WHERE trace_id = ? ORDER BY start_ms`;
const TRACE_LOGS_SQL = `SELECT trace_id, span_id, seq, ts_ms, level, message, operation
	FROM logs WHERE trace_id = ? ORDER BY ts_ms, seq`;

/** Run read-only SQL through the collector's `/query` (via the harness proxy),
 * mapping the `{ columns, rows }` result into plain row objects. */
async function queryStore(
	mf: Miniflare,
	sql: string,
	params?: unknown[]
): Promise<Record<string, unknown>[]> {
	const response = await mf.dispatchFetch("http://localhost/wobs/query", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ sql, params }),
	});
	const { columns, rows } = (await response.json()) as {
		columns: string[];
		rows: unknown[][];
	};
	return rows.map((row) => {
		const obj: Record<string, unknown> = {};
		columns.forEach((col, i) => {
			obj[col] = row[i];
		});
		return obj;
	});
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

// A user worker that both seeds the internal TraceStore (cross-script DO binding,
// simulating what the capture layer will write via RPC) and proxies `/wobs/*` to
// the collector's read API (service binding). Seeding directly lets us test the
// store + read API without the capture half.
const STORE_HARNESS = `
const SPANS = [
	{
		traceId: "trace-orders", spanId: "root", parentId: null,
		name: "GET /orders", kind: "http", startMs: 1000, durationMs: 5,
		outcome: "ok", error: null,
		attributes: {
			"faas.trigger": "http",
			"http.request.method": "GET",
			"http.response.status_code": 200,
			"cloudflare.outcome": "ok",
			cpu_time_ms: 1.5,
			wall_time_ms: 4,
		},
	},
	{
		traceId: "trace-orders", spanId: "kv", parentId: "root",
		name: "kv get", kind: "kv", startMs: 1001, durationMs: 1,
		outcome: "ok", error: null, attributes: { "cloudflare.binding": "CACHE" },
	},
	{
		traceId: "trace-boom", spanId: "root", parentId: null,
		name: "GET /", kind: "http", startMs: 2000, durationMs: 3,
		outcome: "exception", error: "Error: boom-kaboom",
		attributes: { "faas.trigger": "http", "http.request.method": "GET" },
	},
];
const LOGS = [
	{ traceId: "trace-orders", spanId: "root", tsMs: 1002, level: "info", message: JSON.stringify("handled request"), operation: "GET /orders" },
	{ traceId: "trace-orders", spanId: "root", tsMs: 1005, level: "info", message: JSON.stringify("GET /orders 200"), operation: "GET /orders" },
	{ traceId: "trace-boom", spanId: "root", tsMs: 2001, level: "error", message: JSON.stringify("Error: boom-kaboom\\n    at fetch"), operation: "GET /" },
];
export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname === "/seed") {
			const store = env.TRACE_STORE.get(env.TRACE_STORE.idFromName("singleton"));
			await store.persist(SPANS, LOGS);
			return new Response("seeded");
		}
		if (url.pathname === "/wt-open") {
			const store = env.TRACE_STORE.get(env.TRACE_STORE.idFromName("singleton"));
			// A root span and a child span, both opened without a duration/outcome
			// (still running). Attributes stream in as two separate merges so the
			// test can prove jsonb_patch merges rather than overwrites.
			await store.openSpan({
				traceId: "trace-wt", spanId: "root", parentId: null,
				name: "agent run", kind: "http", startMs: 5000,
				durationMs: null, outcome: null, error: null,
				attributes: { "faas.trigger": "http" },
			});
			await store.openSpan({
				traceId: "trace-wt", spanId: "child", parentId: "root",
				name: "downstream fetch", kind: "fetch", startMs: 5001,
				durationMs: null, outcome: null, error: null, attributes: null,
			});
			await store.mergeAttributes("trace-wt", "child", { "http.request.method": "GET" });
			await store.mergeAttributes("trace-wt", "child", { "http.response.status_code": 200 });
			await store.appendLog({
				traceId: "trace-wt", spanId: "root", tsMs: 5002,
				level: "info", message: JSON.stringify("thinking..."), operation: "agent run",
			});
			return new Response("opened");
		}
		if (url.pathname === "/wt-close") {
			const store = env.TRACE_STORE.get(env.TRACE_STORE.idFromName("singleton"));
			// Close-time attributes (null on the child) must leave the open-phase
			// attributes intact; the root folds in final timing.
			await store.closeSpan("trace-wt", "child", {
				durationMs: 42, outcome: "ok", error: null, attributes: null,
			});
			await store.closeSpan("trace-wt", "root", {
				durationMs: 1234, outcome: "ok", error: null,
				attributes: { cpu_time_ms: 2 },
			});
			return new Response("closed");
		}
		if (url.pathname.startsWith("/wobs/")) {
			return env.WOBS.fetch(
				new Request("http://collector" + url.pathname.slice("/wobs".length) + url.search, request)
			);
		}
		return new Response("ok");
	},
};`;

function storeWorker(): WorkerOptions {
	return {
		name: "user",
		modules: true,
		compatibilityDate: "2026-06-01",
		script: STORE_HARNESS,
		// Bind the collector's internal TraceStore DO (cross-script) to seed it,
		// and the collector service to read it back through the HTTP read API.
		durableObjects: {
			TRACE_STORE: {
				className: "TraceStore",
				scriptName: OBSERVABILITY_COLLECTOR_SERVICE_NAME,
			},
		},
		serviceBindings: { WOBS: { name: OBSERVABILITY_COLLECTOR_SERVICE_NAME } },
	};
}

interface TraceRow {
	trace_id: string;
	name: string;
	outcome: string;
	span_count: number;
	error_count: number;
}

describe("unsafeObservability (TraceStore + read API)", () => {
	test("persists spans/logs and reads them back through the collector API", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			unsafeObservability: true,
			workers: [storeWorker()],
		});
		useDispose(mf);

		expect(await (await mf.dispatchFetch("http://localhost/seed")).text()).toBe(
			"seeded"
		);

		const traces = (await queryStore(
			mf,
			TRACE_LIST_SQL
		)) as unknown as TraceRow[];

		// Our seeded root is present (capture also records the harness's own
		// requests, so we identify the seeded trace by id rather than by count).
		const orders = traces.find((t) => t.trace_id === "trace-orders");
		assert(orders, "expected the seeded 'trace-orders' trace");
		expect(orders.name).toBe("GET /orders");
		expect(orders.outcome).toBe("ok");
		expect(orders.span_count).toBe(2); // root + KV child
		expect(orders.error_count).toBe(0);

		const spans = (await queryStore(mf, TRACE_SPANS_SQL, [
			"trace-orders",
		])) as unknown as Array<{ kind: string; attributes: string | null }>;
		const logs = (await queryStore(mf, TRACE_LOGS_SQL, [
			"trace-orders",
		])) as unknown as Array<{ level: string; message: string }>;

		// The KV read is a child span, distinct from the root.
		expect(spans.some((s) => s.kind === "kv")).toBe(true);

		// Both the app log and the synthetic per-invocation log round-trip.
		expect(logs.some((l) => l.message.includes("handled request"))).toBe(true);
		expect(logs.some((l) => l.message.includes("GET /orders 200"))).toBe(true);

		// The root span's attributes survive the jsonb() round-trip, incl. the
		// HTTP status folded in as an attribute (not a column) per the schema.
		const root = spans.find((s) => {
			const a = JSON.parse(s.attributes ?? "{}");
			return a["faas.trigger"] === "http";
		});
		assert(root, "expected a root http span");
		const attrs = JSON.parse(root.attributes ?? "{}");
		expect(attrs["http.request.method"]).toBe("GET");
		expect(attrs["http.response.status_code"]).toBe(200);
		expect(attrs["cloudflare.outcome"]).toBe("ok");
		expect(typeof attrs["cpu_time_ms"]).toBe("number");
	});

	test("surfaces an error trace's error count and error-level log", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			unsafeObservability: true,
			workers: [storeWorker()],
		});
		useDispose(mf);

		await (await mf.dispatchFetch("http://localhost/seed")).text();

		const traces = (await queryStore(
			mf,
			TRACE_LIST_SQL
		)) as unknown as TraceRow[];
		const boom = traces.find((t) => t.trace_id === "trace-boom");
		assert(boom, "expected the seeded 'trace-boom' trace");
		expect(boom.error_count).toBeGreaterThan(0);

		const logs = (await queryStore(mf, TRACE_LOGS_SQL, [
			"trace-boom",
		])) as unknown as Array<{ level: string; message: string }>;
		expect(
			logs.some((l) => l.level === "error" && l.message.includes("boom-kaboom"))
		).toBe(true);
	});
});

interface WtSpan {
	span_id: string;
	parent_id: string | null;
	duration_ms: number | null;
	outcome: string | null;
	attributes: string | null;
}

describe("unsafeObservability (write-through capture)", () => {
	test("opens spans in-flight, merges streamed attributes, and finalises on close", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			unsafeObservability: true,
			workers: [storeWorker()],
		});
		useDispose(mf);

		async function readWt() {
			const spans = (await queryStore(mf, TRACE_SPANS_SQL, [
				"trace-wt",
			])) as unknown as WtSpan[];
			const logs = (await queryStore(mf, TRACE_LOGS_SQL, [
				"trace-wt",
			])) as unknown as Array<{
				span_id: string | null;
				seq: number;
				message: string;
			}>;
			return { spans, logs };
		}

		// --- open phase: spans are written but not yet closed ---
		expect(
			await (await mf.dispatchFetch("http://localhost/wt-open")).text()
		).toBe("opened");

		let detail = await readWt();
		const childOpen = detail.spans.find((s) => s.span_id === "child");
		assert(childOpen, "expected the open child span");
		// duration_ms IS NULL marks a still-running span.
		expect(childOpen.duration_ms).toBe(null);
		expect(childOpen.outcome).toBe(null);
		// Both merged attribute payloads are present while the span is still open
		// (jsonb_patch merges rather than overwrites).
		const openAttrs = JSON.parse(childOpen.attributes ?? "{}");
		expect(openAttrs["http.request.method"]).toBe("GET");
		expect(openAttrs["http.response.status_code"]).toBe(200);
		// The root is visible in-flight too, and its log was appended with a seq.
		const rootOpen = detail.spans.find((s) => s.span_id === "root");
		assert(rootOpen, "expected the open root span");
		expect(rootOpen.duration_ms).toBe(null);
		expect(detail.logs.some((l) => l.message.includes("thinking"))).toBe(true);

		// --- close phase: duration/outcome land, final attributes merge in ---
		expect(
			await (await mf.dispatchFetch("http://localhost/wt-close")).text()
		).toBe("closed");

		detail = await readWt();
		const childClosed = detail.spans.find((s) => s.span_id === "child");
		assert(childClosed, "expected the closed child span");
		expect(childClosed.duration_ms).toBe(42);
		expect(childClosed.outcome).toBe("ok");
		// Attributes from the open phase survive the close-time merge.
		const closedAttrs = JSON.parse(childClosed.attributes ?? "{}");
		expect(closedAttrs["http.request.method"]).toBe("GET");
		const rootClosed = detail.spans.find((s) => s.span_id === "root");
		assert(rootClosed, "expected the closed root span");
		expect(rootClosed.duration_ms).toBe(1234);
		expect(JSON.parse(rootClosed.attributes ?? "{}")["cpu_time_ms"]).toBe(2);
	});
});

// A plain user worker (no manual seeding): it does some work, logs, and proxies
// `/wobs/*` to the collector's read API. With `unsafeObservability`, core attaches
// the collector as a streaming-tail consumer, so the worker's invocation is folded
// (via cf-to-otel) into spans/logs and persisted — nothing observability-specific
// is wired here by hand.
const CAPTURE_WORKER = `export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/wobs/")) {
			return env.WOBS.fetch(
				new Request("http://collector" + url.pathname.slice("/wobs".length) + url.search, request)
			);
		}
		if (url.pathname === "/boom") {
			throw new Error("boom-kaboom");
		}
		await env.CACHE.get("some-key");
		console.log("handled request");
		return new Response("ok");
	},
};`;

function captureWorker(): WorkerOptions {
	return {
		name: "user",
		modules: true,
		compatibilityDate: "2026-06-01",
		script: CAPTURE_WORKER,
		kvNamespaces: { CACHE: "cache-namespace" },
		serviceBindings: { WOBS: { name: OBSERVABILITY_COLLECTOR_SERVICE_NAME } },
	};
}

/** Wait for the collector's streaming-tail persist to flush. */
async function flush() {
	await new Promise((resolve) => setTimeout(resolve, 1000));
}

describe("unsafeObservability (capture via cf-to-otel)", () => {
	test("captures a worker's trace, child spans, and logs", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			unsafeObservability: true,
			workers: [captureWorker()],
		});
		useDispose(mf);

		expect(
			await (await mf.dispatchFetch("http://localhost/orders")).text()
		).toBe("ok");
		await flush();

		const traces = (await queryStore(
			mf,
			TRACE_LIST_SQL
		)) as unknown as TraceRow[];
		// cf-to-otel names the root fetch span after the method. The finished
		// /orders request is a "GET"; the `POST /wobs/query` read we're issuing
		// right now is itself captured (write-through) as a still-running "POST".
		const trace = traces.find((t) => t.name === "GET" && t.outcome !== null);
		assert(trace, "expected a captured 'GET' trace");
		expect(trace.outcome).toBe("ok");
		// Write-through in action: this very read request is captured while still
		// running, so a POST trace with no outcome yet is present alongside it.
		expect(traces.some((t) => t.name === "POST" && t.outcome === null)).toBe(
			true
		);
		expect(trace.span_count).toBeGreaterThan(1); // root + KV child
		expect(trace.error_count).toBe(0);

		const spans = (await queryStore(mf, TRACE_SPANS_SQL, [
			trace.trace_id,
		])) as unknown as Array<{ kind: string; attributes: string | null }>;
		const logs = (await queryStore(mf, TRACE_LOGS_SQL, [
			trace.trace_id,
		])) as unknown as Array<{ level: string; message: string }>;

		// The KV read is captured as a child span with a friendly kind.
		expect(spans.some((s) => s.kind === "kv")).toBe(true);

		// console.log is captured, and the synthetic per-invocation log shows up
		// (so silent workers still appear) — its body carries the request path.
		expect(logs.some((l) => l.message.includes("handled request"))).toBe(true);
		expect(logs.some((l) => l.message.includes("/orders"))).toBe(true);

		// The root span carries the cf-to-otel-shaped attributes, incl. the HTTP
		// status folded in as an attribute (not a column) per the schema.
		const root = spans.find((s) => {
			const a = JSON.parse(s.attributes ?? "{}");
			return a["faas.trigger"] === "http";
		});
		assert(root, "expected a root http span");
		const attrs = JSON.parse(root.attributes ?? "{}");
		expect(attrs["http.request.method"]).toBe("GET");
		expect(attrs["http.response.status_code"]).toBe(200);
		expect(attrs["cloudflare.outcome"]).toBe("ok");
		expect(typeof attrs["cpu_time_ms"]).toBe("number");
	});

	test("captures an uncaught exception as a span error and error log", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			unsafeObservability: true,
			workers: [captureWorker()],
		});
		useDispose(mf);

		await (await mf.dispatchFetch("http://localhost/boom")).text();
		await flush();

		const traces = (await queryStore(
			mf,
			TRACE_LIST_SQL
		)) as unknown as TraceRow[];
		// The in-flight `/wobs/query` read is also a "GET" trace (outcome NULL);
		// select the finished /boom one.
		const trace = traces.find((t) => t.name === "GET" && t.outcome !== null);
		assert(trace, "expected a captured 'GET' trace");
		expect(trace.error_count).toBeGreaterThan(0);

		const logs = (await queryStore(mf, TRACE_LOGS_SQL, [
			trace.trace_id,
		])) as unknown as Array<{ level: string; message: string }>;
		expect(
			logs.some((l) => l.level === "error" && l.message.includes("boom-kaboom"))
		).toBe(true);
	});
});

// Two user workers with a service binding between them. The collector is attached
// to *every* user worker, so both invocations are captured; each span records its
// owning worker (`service`) for multi-worker attribution.
const DOWNSTREAM_WORKER = `export default {
	async fetch(request, env) {
		await env.CACHE.get("b-key");
		console.log("handled by downstream");
		return new Response("from-downstream");
	},
};`;

const UPSTREAM_WORKER = `export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/wobs/")) {
			return env.WOBS.fetch(
				new Request("http://collector" + url.pathname.slice("/wobs".length) + url.search, request)
			);
		}
		const res = await env.DOWNSTREAM.fetch("http://downstream/work");
		return new Response("upstream->" + (await res.text()));
	},
};`;

function multiWorkerSetup(): WorkerOptions[] {
	return [
		{
			name: "upstream",
			modules: true,
			compatibilityDate: "2026-06-01",
			script: UPSTREAM_WORKER,
			serviceBindings: {
				DOWNSTREAM: "downstream",
				WOBS: { name: OBSERVABILITY_COLLECTOR_SERVICE_NAME },
			},
		},
		{
			name: "downstream",
			modules: true,
			compatibilityDate: "2026-06-01",
			script: DOWNSTREAM_WORKER,
			kvNamespaces: { CACHE: "cache-namespace" },
		},
	];
}

interface MultiTraceRow extends TraceRow {
	service: string;
	service_count: number;
}
interface DetailSpan {
	span_id: string;
	parent_id: string | null;
	service: string | null;
	name: string;
	kind: string;
}

describe("unsafeObservability (multi-worker)", () => {
	test("captures a cross-worker distributed trace, attributed per worker", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			unsafeObservability: true,
			workers: multiWorkerSetup(),
		});
		useDispose(mf);

		expect(
			await (await mf.dispatchFetch("http://localhost/entry")).text()
		).toBe("upstream->from-downstream");
		await flush();

		const traces = (await queryStore(
			mf,
			TRACE_LIST_SQL
		)) as unknown as MultiTraceRow[];

		// upstream → downstream over a service binding is a single distributed
		// trace — the only one spanning two workers.
		const trace = traces.find((t) => t.service_count === 2);
		assert(trace, "expected a distributed trace spanning two workers");
		expect(trace.service).toBe("upstream"); // rooted at the entry worker
		expect(trace.name).toBe("GET");
		expect(trace.outcome).toBe("ok");
		expect(trace.span_count).toBeGreaterThanOrEqual(4);

		const spans = (await queryStore(mf, TRACE_SPANS_SQL, [
			trace.trace_id,
		])) as unknown as DetailSpan[];

		// Both workers' spans are present and attributed to the right worker.
		const services = new Set(spans.map((s) => s.service));
		expect(services.has("upstream")).toBe(true);
		expect(services.has("downstream")).toBe(true);
		const kv = spans.find((s) => s.kind === "kv");
		assert(kv, "expected the downstream KV span");
		expect(kv.service).toBe("downstream");

		// Exactly one root (the upstream invocation); every other span links to a
		// parent within the same trace (the cross-worker call graph is stitched).
		const ids = new Set(spans.map((s) => s.span_id));
		const roots = spans.filter((s) => s.parent_id === null);
		expect(roots).toHaveLength(1);
		expect(roots[0].service).toBe("upstream");
		for (const s of spans) {
			if (s.parent_id !== null) {
				expect(ids.has(s.parent_id)).toBe(true);
			}
		}
	});
});

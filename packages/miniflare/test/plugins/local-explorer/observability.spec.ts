import assert from "node:assert";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, type ExpectStatic, test } from "vitest";
import { OBSERVABILITY_COLLECTOR_SERVICE_NAME } from "../../../src/plugins/core/constants";
import { CorePaths } from "../../../src/workers/core/constants";
import {
	zObservabilityQueryResponse,
	zWorkersApiResponseCommonFailure,
} from "../../../src/workers/local-explorer/generated/zod.gen";
import { disposeWithRetry } from "../../test-shared";
import { expectValidResponse } from "./helpers";

const BASE_URL = `http://localhost${CorePaths.EXPLORER}/api`;

// A user worker that seeds the internal TraceStore (cross-script DO binding) so
// the Observability API has deterministic data to read back. `/seed` runs on the
// user worker; the `/cdn-cgi/explorer/api/local/observability/query` route hits the
// explorer worker, which proxies to the collector.
const SEED_WORKER = `
const SPANS = [
	{ traceId: "t-api-1", spanId: "root", parentId: null, service: "api-demo", name: "GET /orders", kind: "http", startMs: 1000, durationMs: 5, outcome: "ok", error: null, attributes: { "faas.trigger": "http", "http.request.method": "GET", "http.response.status_code": 200 } },
	{ traceId: "t-api-1", spanId: "kv", parentId: "root", service: "api-demo", name: "kv_get", kind: "kv", startMs: 1001, durationMs: 1, outcome: "ok", error: null, attributes: { "cloudflare.binding.name": "CACHE" } },
];
const LOGS = [
	{ traceId: "t-api-1", spanId: "root", tsMs: 1002, level: "info", message: JSON.stringify("handled request"), operation: "GET /orders" },
];
export default {
	async fetch(request, env) {
		if (new URL(request.url).pathname === "/seed") {
			const store = env.TRACE_STORE.get(env.TRACE_STORE.idFromName("singleton"));
			await store.persist(SPANS, LOGS);
			return new Response("seeded");
		}
		return new Response("ok");
	},
};`;

/** Run a read-only SQL query through the Observability read API. */
async function query(
	mf: Miniflare,
	expect: ExpectStatic,
	sql: string,
	params?: unknown[]
): Promise<Record<string, unknown>[]> {
	const response = await mf.dispatchFetch(
		`${BASE_URL}/local/observability/query`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ sql, params }),
		}
	);
	const data = await expectValidResponse(
		response,
		zObservabilityQueryResponse,
		expect
	);
	const columns = data.result?.columns ?? [];
	const rows = data.result?.rows ?? [];
	return rows.map((row) => {
		const obj: Record<string, unknown> = {};
		columns.forEach((col, i) => {
			obj[col] = row[i];
		});
		return obj;
	});
}

describe("Observability API", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			compatibilityDate: "2026-01-01",
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			unsafeObservability: true,
			workers: [
				{
					name: "user",
					modules: true,
					compatibilityDate: "2026-01-01",
					script: SEED_WORKER,
					durableObjects: {
						TRACE_STORE: {
							className: "TraceStore",
							scriptName: OBSERVABILITY_COLLECTOR_SERVICE_NAME,
						},
					},
				},
			],
		});
		await (await mf.dispatchFetch("http://localhost/seed")).text();
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	test("lists captured traces (root spans + counts) via SQL", async ({
		expect,
	}) => {
		const traces = await query(
			mf,
			expect,
			`SELECT trace_id, service, name,
				(SELECT COUNT(*) FROM spans s2 WHERE s2.trace_id = spans.trace_id) AS span_count,
				(SELECT COUNT(DISTINCT s3.service) FROM spans s3 WHERE s3.trace_id = spans.trace_id AND s3.service IS NOT NULL) AS service_count
			FROM spans WHERE parent_id IS NULL ORDER BY start_ms DESC`
		);
		const trace = traces.find((t) => t.trace_id === "t-api-1");
		assert(trace, "expected the seeded 't-api-1' trace");
		expect(trace.service).toBe("api-demo");
		expect(trace.name).toBe("GET /orders");
		expect(trace.span_count).toBe(2);
		expect(trace.service_count).toBe(1);
	});

	test("returns a trace's spans + logs via SQL (params bound)", async ({
		expect,
	}) => {
		const spans = await query(
			mf,
			expect,
			`SELECT span_id, service, kind, json(attributes) AS attributes
			FROM spans WHERE trace_id = ? ORDER BY start_ms`,
			["t-api-1"]
		);
		expect(spans.some((s) => s.kind === "kv")).toBe(true);
		expect(spans.every((s) => s.service === "api-demo")).toBe(true);

		const logs = await query(
			mf,
			expect,
			`SELECT level, message FROM logs WHERE trace_id = ? ORDER BY ts_ms, seq`,
			["t-api-1"]
		);
		expect(
			logs.some((l) => String(l.message ?? "").includes("handled request"))
		).toBe(true);
	});

	test("runs a read-only query", async ({ expect }) => {
		const rows = await query(
			mf,
			expect,
			"SELECT COUNT(*) AS n FROM spans WHERE trace_id = ?",
			["t-api-1"]
		);
		expect(rows).toEqual([{ n: 2 }]);
	});

	test("rejects non-read-only SQL", async ({ expect }) => {
		const response = await mf.dispatchFetch(
			`${BASE_URL}/local/observability/query`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sql: "DELETE FROM spans" }),
			}
		);
		await expectValidResponse(
			response,
			zWorkersApiResponseCommonFailure,
			expect,
			400
		);
	});

	test("rejects a second (sneaked-in) statement", async ({ expect }) => {
		const response = await mf.dispatchFetch(
			`${BASE_URL}/local/observability/query`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sql: "SELECT 1; DROP TABLE spans" }),
			}
		);
		await expectValidResponse(
			response,
			zWorkersApiResponseCommonFailure,
			expect,
			400
		);
	});

	test("rejects a CTE that writes (WITH … DELETE)", async ({ expect }) => {
		// A leading-keyword check alone would let this through: it's a single
		// statement that starts with `WITH` but still deletes from the store.
		const response = await mf.dispatchFetch(
			`${BASE_URL}/local/observability/query`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					sql: "WITH x AS (SELECT 1) DELETE FROM spans",
				}),
			}
		);
		await expectValidResponse(
			response,
			zWorkersApiResponseCommonFailure,
			expect,
			400
		);

		// The store still has its data (the write never ran).
		const rows = await query(
			mf,
			expect,
			"SELECT COUNT(*) AS n FROM spans WHERE trace_id = ?",
			["t-api-1"]
		);
		expect(rows).toEqual([{ n: 2 }]);
	});
});

describe("Observability API (observability disabled)", () => {
	let mf: Miniflare;

	beforeAll(() => {
		mf = new Miniflare({
			compatibilityDate: "2026-01-01",
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			modules: true,
			script: `export default { fetch() { return new Response("ok"); } }`,
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	test("returns a clear 404 when observability isn't enabled", async ({
		expect,
	}) => {
		const response = await mf.dispatchFetch(
			`${BASE_URL}/local/observability/query`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sql: "SELECT 1" }),
			}
		);
		await expectValidResponse(
			response,
			zWorkersApiResponseCommonFailure,
			expect,
			404
		);
	});
});

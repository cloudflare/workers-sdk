import { observabilityQuery } from "../api";
import type { QueryClause } from "./observability-query";

/**
 * The Observability store's only read endpoint is `POST /local/observability/query`
 * (read-only SQL returning `{ columns, rows }`). There are no typed per-view
 * routes, so these row shapes are defined here in the UI, and the common views
 * are the canned queries below. The `spans`/`logs` schema is the contract (it's
 * published in the endpoint's OpenAPI description).
 */
export interface Span {
	trace_id: string;
	span_id: string;
	parent_id?: string | null;
	service?: string | null;
	name?: string | null;
	kind?: string | null;
	start_ms?: number | null;
	duration_ms?: number | null;
	outcome?: string | null;
	error?: string | null;
	/** JSON string (the query wraps the JSONB column with `json(attributes)`). */
	attributes?: string | null;
}

/** A root span plus the per-trace aggregate counts from the trace-list query. */
export interface TraceSummary extends Span {
	span_count?: number;
	error_count?: number;
	service_count?: number;
}

export interface Log {
	trace_id: string;
	span_id?: string | null;
	seq: number;
	ts_ms?: number | null;
	level?: string | null;
	message?: string;
	operation?: string | null;
}

// Canned queries backing the Observability tab's views. They read the real
// column names and wrap the JSONB `attributes` column with `json(...)` so it
// comes back as a JSON string.
const TRACE_LIST_SQL = `SELECT trace_id, span_id, service, name, kind, start_ms, duration_ms, outcome,
		json(attributes) AS attributes,
		(SELECT COUNT(*) FROM spans s2 WHERE s2.trace_id = spans.trace_id) AS span_count,
		(SELECT COUNT(*) FROM spans s3 WHERE s3.trace_id = spans.trace_id AND s3.error IS NOT NULL) AS error_count,
		(SELECT COUNT(DISTINCT s4.service) FROM spans s4 WHERE s4.trace_id = spans.trace_id AND s4.service IS NOT NULL) AS service_count
	FROM spans WHERE parent_id IS NULL ORDER BY start_ms DESC LIMIT ?`;
const TRACE_SPANS_SQL = `SELECT trace_id, span_id, parent_id, service, name, kind, start_ms, duration_ms, outcome, error, json(attributes) AS attributes
	FROM spans WHERE trace_id = ? ORDER BY start_ms`;
const TRACE_LOGS_SQL = `SELECT trace_id, span_id, seq, ts_ms, level, message, operation
	FROM logs WHERE trace_id = ? ORDER BY ts_ms, seq`;

/** Run a read-only query and map the `{ columns, rows }` grid into row objects. */
async function runQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
	const response = await observabilityQuery({
		body: { sql, params },
		throwOnError: true,
	});
	const result = response.data?.result;
	const columns = result?.columns ?? [];
	const rows = result?.rows ?? [];
	return rows.map((row) => {
		const obj: Record<string, unknown> = {};
		columns.forEach((col, i) => {
			obj[col] = row[i];
		});
		return obj as T;
	});
}

/** Recent invocations (root spans), newest first, with per-trace counts. */
export function fetchTraces(limit: number): Promise<TraceSummary[]> {
	return runQuery<TraceSummary>(TRACE_LIST_SQL, [limit]);
}

/** All spans for one trace, ordered by start time. */
export function fetchTraceSpans(traceId: string): Promise<Span[]> {
	return runQuery<Span>(TRACE_SPANS_SQL, [traceId]);
}

/** All logs for one trace, in order. */
export function fetchTraceLogs(traceId: string): Promise<Log[]> {
	return runQuery<Log>(TRACE_LOGS_SQL, [traceId]);
}

/** A span placed in the trace's waterfall: tree depth + timeline position. */
export interface WaterfallSpan {
	span: Span;
	depth: number;
	/** Left offset (0–100) of the span's bar within the trace window. */
	offsetPct: number;
	/** Width (0–100) of the span's bar within the trace window. */
	widthPct: number;
	/** True while the span is still running (`duration_ms` is NULL). */
	running: boolean;
}

/** A span is still running until its `duration_ms` lands (see write-through capture). */
export function isRunning(span: Span): boolean {
	return span.duration_ms === null || span.duration_ms === undefined;
}

/**
 * Under the Vite plugin your Worker runs inside a runner Durable Object behind a
 * few internal wrapper workers, so some tooling-only "wrapper" spans leak into
 * the trace. Capture doesn't tag them, so we recognise them by the Vite plugin's
 * internal worker/DO/path names. These are kept in sync by hand with
 * packages/vite-plugin-cloudflare (`constants.ts` / `shared.ts`); a stray miss
 * only means a wrapper span stays visible, never that a user span is hidden.
 */
const VITE_WRAPPER_MARKERS = [
	"__VITE_RUNNER_OBJECT__",
	"__router-worker__",
	"__asset-worker__",
	"__vite_proxy_worker__",
	"__vite_plugin_cloudflare", // init + get-export-types internal paths
];

/** True if the span comes from Vite's runner/wrapper plumbing, not user code. */
export function isViteWrapperSpan(span: Span): boolean {
	const haystack = `${span.service ?? ""} ${span.name ?? ""} ${span.attributes ?? ""}`;
	return VITE_WRAPPER_MARKERS.some((marker) => haystack.includes(marker));
}

/**
 * Order spans into a depth-first waterfall: each span nested under its parent
 * (by `parent_id`), siblings ordered by start time, with a timeline offset/width
 * relative to the whole trace's window. Spans whose parent isn't in the trace are
 * treated as roots (so nothing is dropped).
 */
export function buildWaterfall(spans: Span[]): WaterfallSpan[] {
	if (spans.length === 0) {
		return [];
	}

	let windowStart = Infinity;
	let windowEnd = -Infinity;
	for (const s of spans) {
		const start = s.start_ms ?? 0;
		// A running span has no end yet; its start still bounds the window so the
		// bar has an anchor, and it's drawn out to the current trace edge below.
		const end = start + (s.duration_ms ?? 0);
		windowStart = Math.min(windowStart, start);
		windowEnd = Math.max(windowEnd, end);
	}
	const window = Math.max(windowEnd - windowStart, 1);

	const ids = new Set(spans.map((s) => s.span_id));
	const childrenOf = new Map<string | null, Span[]>();
	for (const s of spans) {
		const parent = s.parent_id && ids.has(s.parent_id) ? s.parent_id : null;
		const siblings = childrenOf.get(parent) ?? [];
		siblings.push(s);
		childrenOf.set(parent, siblings);
	}
	for (const siblings of childrenOf.values()) {
		siblings.sort((a, b) => (a.start_ms ?? 0) - (b.start_ms ?? 0));
	}

	const out: WaterfallSpan[] = [];
	const seen = new Set<string>();
	function visit(parent: string | null, depth: number): void {
		for (const span of childrenOf.get(parent) ?? []) {
			if (seen.has(span.span_id)) {
				continue; // guard against cycles
			}
			seen.add(span.span_id);
			const start = span.start_ms ?? windowStart;
			const running = isRunning(span);
			const offsetPct = ((start - windowStart) / window) * 100;
			// A running span is drawn from its start out to the current edge of the
			// trace (we don't know its end yet); a finished span uses its duration.
			const widthPct = running
				? Math.max(100 - offsetPct, 0.5)
				: Math.max(((span.duration_ms ?? 0) / window) * 100, 0.5);
			out.push({ span, depth, offsetPct, widthPct, running });
			visit(span.span_id, depth + 1);
		}
	}
	visit(null, 0);
	return out;
}

/** Human-readable duration, e.g. `0ms`, `4.2ms`, `1.30s`. */
export function formatDuration(ms?: number | null): string {
	if (ms === undefined || ms === null || Number.isNaN(ms)) {
		return "—";
	}
	if (ms < 1000) {
		return `${Math.round(ms * 100) / 100}ms`;
	}
	return `${(ms / 1000).toFixed(2)}s`;
}

/** Parse the store's JSON-encoded `attributes` string into an object. */
export function parseAttributes(json?: string | null): Record<string, unknown> {
	if (!json) {
		return {};
	}
	try {
		const value = JSON.parse(json);
		return value && typeof value === "object"
			? (value as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

/** Parse a JSON-encoded log message back to a display string. */
export function formatLogMessage(message?: string): string {
	if (message === undefined) {
		return "";
	}
	try {
		const value = JSON.parse(message);
		return typeof value === "string" ? value : JSON.stringify(value);
	} catch {
		return message;
	}
}

// ---------------------------------------------------------------------------
// Trace list + Logs list (the Observability tab's Traces and Logs views).
//
// Both read through the single read-only `/query` endpoint. The trace list
// groups spans by trace (root = parent-less span) and computes per-trace
// aggregates; the logs list reads the `logs` table directly. Filters are a
// simpler version of the dashboard's query builder (see observability-query.ts).
// ---------------------------------------------------------------------------

/** A root span plus per-trace aggregates, one row per distributed trace. */
export interface TraceRow {
	trace_id: string;
	/** The parent-less root span's id (a trace is keyed by trace_id + root). */
	root_span_id: string;
	name: string | null;
	kind: string | null;
	service: string | null;
	outcome: string | null;
	error: string | null;
	created_at: string | null;
	start_ms: number | null;
	duration_ms: number | null;
	span_count: number | null;
	error_count: number | null;
	service_count: number | null;
}

/** Filters for the trace list — a simpler version of the dashboard query builder. */
export interface TraceFilters {
	/** free-text: matches operation name, any span name, or any span attribute. */
	search?: string;
	/** "all" | "success" | "error" */
	status?: "all" | "success" | "error";
	/** "all" or a span kind: http | fetch | d1 | kv | r2 | do */
	kind?: string;
	/** attribute/tag key to filter on; "all"/empty = no tag filter. */
	tagKey?: string;
	/** optional value substring for the chosen tag key. */
	tagValue?: string;
	/** structured clauses parsed from the query bar. */
	clauses?: QueryClause[];
	limit?: number;
}

// A span counts as an error if it failed outright (`error`/`outcome`) or it's an
// HTTP span whose response status is >= 400. Local capture records the status in
// the OTel `http.response.status_code` attribute rather than on `outcome`, so a
// 4xx/5xx request otherwise looks like a successful ("ok") invocation.
const SPAN_IS_ERROR = `(error IS NOT NULL OR (outcome IS NOT NULL AND outcome != 'ok') OR CAST(json_extract(json(attributes), '$."http.response.status_code"') AS INTEGER) >= 400)`;

const TRACE_LIST_HEAD = `SELECT s.trace_id, s.span_id AS root_span_id, s.name, s.kind, s.service, s.outcome, s.error, s.created_at, s.start_ms,
		(SELECT ROUND(MAX(x.start_ms + COALESCE(x.duration_ms, 0)) - MIN(x.start_ms), 2) FROM spans x WHERE x.trace_id = s.trace_id) AS duration_ms,
		(SELECT COUNT(*) FROM spans c WHERE c.trace_id = s.trace_id) AS span_count,
		(SELECT COUNT(*) FROM spans e WHERE e.trace_id = s.trace_id AND ${SPAN_IS_ERROR}) AS error_count,
		(SELECT COUNT(DISTINCT v.service) FROM spans v WHERE v.trace_id = s.trace_id AND v.service IS NOT NULL) AS service_count
	FROM spans s`;

/** Recent traces (most recent first), applying simple filters. */
export function listTraces(filters: TraceFilters = {}): Promise<TraceRow[]> {
	const limit = Number(filters.limit ?? 100);
	const where: string[] = ["s.parent_id IS NULL"];
	const params: unknown[] = [];

	if (filters.status === "success") {
		where.push(
			`s.trace_id NOT IN (SELECT trace_id FROM spans WHERE ${SPAN_IS_ERROR})`
		);
	} else if (filters.status === "error") {
		where.push(
			`s.trace_id IN (SELECT trace_id FROM spans WHERE ${SPAN_IS_ERROR})`
		);
	}

	if (filters.kind && filters.kind !== "all") {
		where.push("s.trace_id IN (SELECT trace_id FROM spans WHERE kind = ?)");
		params.push(filters.kind);
	}

	if (filters.tagKey && filters.tagKey !== "all") {
		const v = filters.tagValue?.trim();
		if (v) {
			where.push(
				"s.trace_id IN (SELECT sp.trace_id FROM spans sp, json_each(json(sp.attributes)) j WHERE j.key = ? AND j.value LIKE ?)"
			);
			params.push(filters.tagKey, `%${v}%`);
		} else {
			where.push(
				"s.trace_id IN (SELECT sp.trace_id FROM spans sp, json_each(json(sp.attributes)) j WHERE j.key = ?)"
			);
			params.push(filters.tagKey);
		}
	}

	for (const c of filters.clauses ?? []) {
		if (c.field === "duration") {
			const n = Number(c.value);
			if (!Number.isNaN(n)) {
				// c.op is restricted to a fixed comparator set by the parser.
				where.push(
					`(SELECT MAX(d.start_ms + COALESCE(d.duration_ms, 0)) - MIN(d.start_ms) FROM spans d WHERE d.trace_id = s.trace_id) ${c.op} ?`
				);
				params.push(n);
			}
		} else {
			where.push(
				"s.trace_id IN (SELECT sp.trace_id FROM spans sp, json_each(json(sp.attributes)) j WHERE j.key = ? AND j.value LIKE ?)"
			);
			params.push(c.field, `%${c.value}%`);
		}
	}

	const q = filters.search?.trim();
	if (q) {
		const like = `%${q}%`;
		where.push(
			"(s.name LIKE ? OR s.trace_id IN (SELECT trace_id FROM spans WHERE name LIKE ? OR json(attributes) LIKE ?))"
		);
		params.push(like, like, like);
	}

	params.push(limit);
	const sql = `${TRACE_LIST_HEAD} WHERE ${where.join(" AND ")} ORDER BY s.start_ms DESC LIMIT ?`;
	return runQuery<TraceRow>(sql, params);
}

/** Distinct attribute/tag keys across all spans (for the tag filter). */
export async function getTagKeys(): Promise<string[]> {
	const rows = await runQuery<{ k: string }>(
		`SELECT DISTINCT j.key AS k FROM spans s, json_each(json(s.attributes)) j
			WHERE s.attributes IS NOT NULL ORDER BY k LIMIT 200`,
		[]
	);
	return rows.map((r) => String(r.k)).filter(Boolean);
}

/**
 * Span ids that begin a worker invocation within a (possibly multi-worker)
 * distributed trace: the parent-less root spans sharing the trace_id. The
 * waterfall marks these (other than the top-level root) as a new invocation.
 * Vite dev module-runner invocations are excluded so only real handoffs show.
 */
export async function getInvocationRootIds(traceId: string): Promise<string[]> {
	const rows = await runQuery<{ span_id: string }>(
		`SELECT span_id FROM spans WHERE trace_id = ? AND parent_id IS NULL
			AND (attributes IS NULL OR json(attributes) NOT LIKE '%__VITE_RUNNER_OBJECT__%')`,
		[traceId]
	);
	return rows.map((r) => String(r.span_id)).filter(Boolean);
}

/** A persisted console.log event (the "Logs" view). */
export interface LogEvent {
	trace_id: string;
	span_id: string | null;
	seq: number;
	ts_ms: number | null;
	level: string | null;
	/** JSON-stringified console.log message. */
	message: string | null;
	operation: string | null;
	created_at: string | null;
}

export interface EventFilters {
	search?: string;
	/** "all" | debug | info | log | warn | error */
	level?: string;
	/** substring match on the emitting operation/route. */
	operation?: string;
	limit?: number;
}

/** Recent log events (most recent first), applying simple filters. */
export function listEvents(filters: EventFilters = {}): Promise<LogEvent[]> {
	const limit = Number(filters.limit ?? 200);
	const where: string[] = [];
	const params: unknown[] = [];

	if (filters.level && filters.level !== "all") {
		where.push("level = ?");
		params.push(filters.level);
	}
	const op = filters.operation?.trim();
	if (op) {
		where.push("operation LIKE ?");
		params.push(`%${op}%`);
	}
	const q = filters.search?.trim();
	if (q) {
		const like = `%${q}%`;
		where.push("(message LIKE ? OR operation LIKE ?)");
		params.push(like, like);
	}

	params.push(limit);
	const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
	const sql = `SELECT trace_id, span_id, seq, ts_ms, level, message, operation, created_at
		FROM logs ${whereSql} ORDER BY created_at DESC, seq DESC LIMIT ?`;
	return runQuery<LogEvent>(sql, params);
}

// ---------------------------------------------------------------------------
// Span-tree layout for the trace waterfall.
// ---------------------------------------------------------------------------

/** A span with computed tree layout (depth + flattened DFS order). */
export interface LayoutSpan {
	trace_id: string;
	span_id: string;
	parent_id?: string | null;
	service?: string | null;
	name?: string | null;
	kind?: string | null;
	/** trace-relative start (ms). */
	start_ms: number;
	/** duration (ms); a still-running span is extended to the trace edge. */
	duration_ms: number;
	/** trace-relative end (ms). */
	end_ms: number;
	outcome?: string | null;
	error?: string | null;
	attributes?: string | null;
	depth: number;
	hasChildren: boolean;
	/** dotted path id ("0", "0.1", "0.1.2") used for collapse/expand. */
	layoutId: string;
	/** true while the span is still running (`duration_ms` was NULL). */
	running: boolean;
}

/** Color/icon kind for a span (falls back to the name if `kind` is unset). */
export function spanKind(span: Pick<Span, "kind" | "name">): string {
	if (span.kind) {
		return span.kind;
	}
	const n = (span.name ?? "").toLowerCase();
	if (n.includes("kv")) {
		return "kv";
	}
	if (n.includes("d1")) {
		return "d1";
	}
	if (n.includes("fetch")) {
		return "fetch";
	}
	if (n.includes("r2")) {
		return "r2";
	}
	return "span";
}

const VITE_RUNNER_MARKER = "__VITE_RUNNER_OBJECT__";

/**
 * Drop the Vite dev module-runner's internal plumbing spans and re-parent their
 * real children up. In `vite dev`, user code runs inside a runner Durable
 * Object, so every invocation is wrapped with a `durable_object_subrequest` →
 * `jsrpc (executeCallback on __VITE_RUNNER_OBJECT__)` chain that isn't the
 * user's code. No-op outside Vite dev.
 */
export function stripDevRunnerSpans(spans: Span[]): Span[] {
	const runnerIds = new Set<string>();
	for (const s of spans) {
		if ((s.attributes ?? "").includes(VITE_RUNNER_MARKER)) {
			runnerIds.add(s.span_id);
		}
	}
	if (runnerIds.size === 0) {
		return spans;
	}

	const dispatchParents = new Set<string>();
	for (const s of spans) {
		if (runnerIds.has(s.span_id) && s.parent_id) {
			dispatchParents.add(s.parent_id);
		}
	}
	const hidden = new Set(runnerIds);
	for (const s of spans) {
		if (
			dispatchParents.has(s.span_id) &&
			s.name === "durable_object_subrequest"
		) {
			hidden.add(s.span_id);
		}
	}

	const byId = new Map(spans.map((s) => [s.span_id, s]));
	const resolveParent = (s: Span): string | null => {
		let p = s.parent_id ?? null;
		while (p && hidden.has(p)) {
			p = byId.get(p)?.parent_id ?? null;
		}
		return p;
	};
	return spans
		.filter((s) => !hidden.has(s.span_id))
		.map((s) => ({ ...s, parent_id: resolveParent(s) }));
}

/**
 * Flatten spans into a depth-ordered list (DFS), mirroring the dashboard's
 * trace waterfall layout. Times are re-based to the earliest span start so the
 * waterfall renders offsets from the trace start; a still-running span (NULL
 * duration) is extended to the current trace edge. Orphans attach to the root.
 */
export function buildSpanTree(
	spans: Span[],
	rootSpanId: string,
	hideDevRunner = false
): LayoutSpan[] {
	const source = hideDevRunner ? stripDevRunnerSpans(spans) : spans;
	if (source.length === 0) {
		return [];
	}

	const t0 = Math.min(...source.map((s) => s.start_ms ?? 0));
	let windowEnd = -Infinity;
	for (const s of source) {
		const start = s.start_ms ?? t0;
		const end = isRunning(s) ? start : start + (s.duration_ms ?? 0);
		windowEnd = Math.max(windowEnd, end);
	}
	if (!Number.isFinite(windowEnd)) {
		windowEnd = t0;
	}

	type Norm = LayoutSpan;
	const norm = source.map(
		(s): Omit<Norm, "depth" | "hasChildren" | "layoutId"> => {
			const startAbs = s.start_ms ?? t0;
			const running = isRunning(s);
			const duration = running
				? Math.max(windowEnd - startAbs, 0)
				: (s.duration_ms ?? 0);
			const start = startAbs - t0;
			return {
				trace_id: s.trace_id,
				span_id: s.span_id,
				parent_id: s.parent_id,
				service: s.service,
				name: s.name,
				kind: s.kind,
				start_ms: start,
				duration_ms: duration,
				end_ms: start + duration,
				outcome: s.outcome,
				error: s.error,
				attributes: s.attributes,
				running,
			};
		}
	);

	const byId = new Map(norm.map((s) => [s.span_id, s]));
	const effectiveRoot = byId.has(rootSpanId)
		? rootSpanId
		: (norm[0]?.span_id ?? rootSpanId);

	const childrenOf = new Map<string, (typeof norm)[number][]>();
	for (const s of norm) {
		if (s.span_id === effectiveRoot) {
			continue;
		}
		let parent = s.parent_id ?? effectiveRoot;
		if (!parent || !byId.has(parent)) {
			parent = effectiveRoot;
		}
		const arr = childrenOf.get(parent) ?? [];
		arr.push(s);
		childrenOf.set(parent, arr);
	}
	for (const arr of childrenOf.values()) {
		arr.sort((a, b) => a.start_ms - b.start_ms);
	}

	const out: LayoutSpan[] = [];
	const visit = (spanId: string, depth: number, layoutId: string): void => {
		const span = byId.get(spanId);
		if (!span) {
			return;
		}
		const children = childrenOf.get(spanId) ?? [];
		out.push({ ...span, depth, hasChildren: children.length > 0, layoutId });
		children.forEach((child, i) => {
			visit(child.span_id, depth + 1, `${layoutId}.${i}`);
		});
	};
	visit(effectiveRoot, 0, "0");
	return out;
}

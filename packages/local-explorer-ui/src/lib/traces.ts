import { d1RawDatabaseQuery } from "../api";
import type { LocalExplorerWorkerBindings } from "../api";

/**
 * Data layer for the Observability (Traces) tab.
 *
 * Traces are persisted by the local trace collector into a regular local D1
 * database (tables `traces` + `spans`). The local explorer can already read any
 * local D1 via the D1 raw-query endpoint, so this tab is just a purpose-built
 * view over that same SQLite store — no separate data pipeline.
 */

export interface TraceRow {
	trace_id: string;
	root_span_id: string;
	name: string | null;
	duration_ms: number | null;
	outcome: string | null;
	status_code: number | null;
	error: string | null;
	span_count: number | null;
	created_at: string | null;
}

export interface SpanRow {
	trace_id: string;
	span_id: string;
	parent_id: string | null;
	name: string | null;
	kind: string | null;
	/** absolute epoch ms as stored; buildSpanTree re-bases to trace-relative */
	start_ms: number;
	end_ms: number | null;
	duration_ms: number;
	outcome: string | null;
	error: string | null;
	/** JSON string of span attributes */
	attributes: string | null;
}

/** A span with computed tree layout (depth + flattened DFS order). */
export interface LayoutSpan extends SpanRow {
	depth: number;
	hasChildren: boolean;
	/** dotted path id ("0", "0.1", "0.1.2") used for collapse/expand */
	layoutId: string;
}

/** Run a SQL statement against a local D1 and return row objects. */
async function runSql(
	databaseId: string,
	sql: string
): Promise<Record<string, unknown>[]> {
	const response = await d1RawDatabaseQuery({
		body: { sql },
		path: { database_id: databaseId },
	});
	const result = response.data?.result?.[0];
	if (!result?.results) {
		return [];
	}
	const columns = result.results.columns ?? [];
	const rows = (result.results.rows ?? []) as unknown[][];
	return rows.map((row) => {
		const obj: Record<string, unknown> = {};
		columns.forEach((col, i) => {
			obj[col] = row[i];
		});
		return obj;
	});
}

/**
 * Binding name of the internal local-observability trace store. Kept in sync
 * with `OBSERVABILITY_D1_BINDING` in `@cloudflare/workers-utils` (the UI can't
 * import from that package, so the constant is mirrored here).
 */
export const TRACE_STORE_BINDING_NAME = "WOBS_TRACES";

/** Whether a D1 binding is the internal observability trace store. */
export function isTraceStoreBinding(binding: {
	bindingName?: string | null;
}): boolean {
	return (binding.bindingName ?? "") === TRACE_STORE_BINDING_NAME;
}

/**
 * Find the D1 database that holds the trace store among a worker's bindings.
 * Prefers the exact internal binding name, falling back to any name containing
 * "trace" for resilience.
 */
export function findTraceDatabaseId(
	bindings: LocalExplorerWorkerBindings | undefined
): string | undefined {
	const candidates = bindings?.d1 ?? [];
	const match =
		candidates.find(isTraceStoreBinding) ??
		candidates.find((db) => /trace/i.test(db.bindingName ?? ""));
	return match?.id;
}

/** Whether the trace store has been initialised (tables exist + have rows). */
export async function hasTraceTables(databaseId: string): Promise<boolean> {
	const rows = await runSql(
		databaseId,
		"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('traces','spans')"
	);
	return rows.length >= 2;
}

/** A single structured clause parsed from the query bar (e.g. `dur:>100`, `db.query.text:orders`). */
export interface QueryClause {
	/** "duration" (numeric, on the trace) or a span attribute key */
	field: string;
	/** comparator; "=" means substring match for attributes */
	op: ">" | ">=" | "<" | "<=" | "=";
	value: string;
}

/** Filters for the trace list — a simpler version of the dashboard query builder. */
export interface TraceFilters {
	/** free-text: matches operation name, any span name, or any span attribute */
	search?: string;
	/** "all" | "success" | "error" */
	status?: "all" | "success" | "error";
	/** "all" or a span kind: http | fetch | d1 | kv | r2 | do */
	kind?: string;
	/** attribute/tag key to filter on (e.g. "db.query.text"); "all"/empty = no tag filter */
	tagKey?: string;
	/** optional value substring for the chosen tag key */
	tagValue?: string;
	/** structured clauses parsed from the query bar */
	clauses?: QueryClause[];
	limit?: number;
}

const esc = (s: string) => s.replace(/'/g, "''");

/** Fetch recent traces (most recent first), applying simple filters. */
export async function listTraces(
	databaseId: string,
	filters: TraceFilters = {}
): Promise<TraceRow[]> {
	const limit = Number(filters.limit ?? 100);
	// A distributed trace can span several worker invocations that share a
	// trace_id; each invocation persists its own row. List only the root
	// invocation (the parent-less one) so each trace shows once, matching the
	// production model (group by trace_id, root = parent-less span).
	const where: string[] = ["(parent_span_id IS NULL OR parent_span_id = '')"];

	if (filters.status === "success") {
		where.push(
			"(COALESCE(status_code, 200) < 400 AND (outcome IS NULL OR outcome = 'ok') AND error IS NULL)"
		);
	} else if (filters.status === "error") {
		where.push(
			"(COALESCE(status_code, 0) >= 400 OR (outcome IS NOT NULL AND outcome != 'ok') OR error IS NOT NULL)"
		);
	}

	if (filters.kind && filters.kind !== "all") {
		where.push(
			`trace_id IN (SELECT trace_id FROM spans WHERE kind = '${esc(filters.kind)}')`
		);
	}

	if (filters.tagKey && filters.tagKey !== "all") {
		const v = filters.tagValue?.trim();
		const valClause = v ? ` AND j.value LIKE '%${esc(v)}%'` : "";
		where.push(
			`trace_id IN (SELECT s.trace_id FROM spans s, json_each(s.attributes) j WHERE j.key = '${esc(filters.tagKey)}'${valClause})`
		);
	}

	// structured clauses from the query bar (e.g. `dur:>100`, `db.query.text:orders`)
	for (const c of filters.clauses ?? []) {
		if (c.field === "duration") {
			const n = Number(c.value);
			// c.op is restricted to a fixed comparator set by the parser, so it is safe to inline
			if (!Number.isNaN(n)) {
				where.push(`COALESCE(duration_ms, 0) ${c.op} ${n}`);
			}
		} else {
			where.push(
				`trace_id IN (SELECT s.trace_id FROM spans s, json_each(s.attributes) j WHERE j.key = '${esc(c.field)}' AND j.value LIKE '%${esc(c.value)}%')`
			);
		}
	}

	const q = filters.search?.trim();
	if (q) {
		const like = `%${esc(q)}%`;
		// matches the trace operation, or any span name / attribute ("log") in it
		where.push(
			`(name LIKE '${like}' OR trace_id IN (SELECT trace_id FROM spans WHERE name LIKE '${like}' OR attributes LIKE '${like}'))`
		);
	}

	const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
	// span_count and duration are computed across ALL invocations sharing the
	// trace_id (the whole distributed trace), not just the root invocation.
	const rows = await runSql(
		databaseId,
		`SELECT trace_id, root_span_id, name,
		 (SELECT ROUND(MAX(end_ms) - MIN(start_ms), 2) FROM spans WHERE spans.trace_id = traces.trace_id) AS duration_ms,
		 outcome, status_code, error,
		 (SELECT COUNT(*) FROM spans WHERE spans.trace_id = traces.trace_id) AS span_count,
		 created_at
		 FROM traces ${whereSql} ORDER BY created_at DESC, ROWID DESC LIMIT ${limit}`
	);
	return rows as unknown as TraceRow[];
}

/** A persisted console.log event (the "Events" view). */
export interface LogEvent {
	trace_id: string;
	span_id: string | null;
	seq: number;
	ts_ms: number | null;
	level: string | null;
	/** JSON-stringified console.log message */
	message: string | null;
	operation: string | null;
	created_at: string | null;
}

export interface EventFilters {
	search?: string;
	/** "all" | debug | info | log | warn | error */
	level?: string;
	/** substring match on the emitting operation/route */
	operation?: string;
	limit?: number;
}

/** Fetch recent log events (most recent first), applying simple filters. */
export async function listEvents(
	databaseId: string,
	filters: EventFilters = {}
): Promise<LogEvent[]> {
	const limit = Number(filters.limit ?? 200);
	const where: string[] = [];

	if (filters.level && filters.level !== "all") {
		where.push(`level = '${esc(filters.level)}'`);
	}
	const op = filters.operation?.trim();
	if (op) {
		where.push(`operation LIKE '%${esc(op)}%'`);
	}
	const q = filters.search?.trim();
	if (q) {
		const like = `%${esc(q)}%`;
		where.push(`(message LIKE '${like}' OR operation LIKE '${like}')`);
	}

	const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
	const rows = await runSql(
		databaseId,
		`SELECT trace_id, span_id, seq, ts_ms, level, message, operation, created_at
		 FROM logs ${whereSql} ORDER BY created_at DESC, ROWID DESC LIMIT ${limit}`
	);
	return rows as unknown as LogEvent[];
}

/** Delete all captured traces, spans, and logs from the trace store. */
export async function clearTraces(databaseId: string): Promise<void> {
	for (const table of ["logs", "spans", "traces"]) {
		try {
			await d1RawDatabaseQuery({
				body: { sql: `DELETE FROM ${table}` },
				path: { database_id: databaseId },
			});
		} catch {
			// table may not exist yet — ignore
		}
	}
}

/** Distinct attribute/tag keys present across all spans (for the tag filter). */
export async function getTagKeys(databaseId: string): Promise<string[]> {
	const rows = await runSql(
		databaseId,
		`SELECT DISTINCT j.key AS k FROM spans s, json_each(s.attributes) j
		 WHERE s.attributes IS NOT NULL ORDER BY k LIMIT 200`
	);
	return rows.map((r) => String(r.k)).filter(Boolean);
}

/**
 * Span ids that are the root of a worker invocation within a (possibly
 * multi-worker) distributed trace. Each invocation persists its own trace row,
 * so these are the `root_span_id`s sharing the trace_id. The waterfall marks
 * these (other than the top-level root) as the start of a new invocation.
 */
export async function getInvocationRootIds(
	databaseId: string,
	traceId: string
): Promise<string[]> {
	const safe = traceId.replace(/'/g, "''");
	// Exclude the Vite dev module-runner's internal invocations
	// (cloudflare.entrypoint = "__VITE_RUNNER_OBJECT__") so the waterfall only
	// marks real worker handoffs, not Vite plumbing.
	const rows = await runSql(
		databaseId,
		`SELECT t.root_span_id FROM traces t
		 JOIN spans s ON s.trace_id = t.trace_id AND s.span_id = t.root_span_id
		 WHERE t.trace_id = '${safe}'
		   AND (s.attributes IS NULL OR s.attributes NOT LIKE '%__VITE_RUNNER_OBJECT__%')`
	);
	return rows.map((r) => String(r.root_span_id)).filter(Boolean);
}

/** Fetch all spans for a single trace. */
export async function getTraceSpans(
	databaseId: string,
	traceId: string
): Promise<SpanRow[]> {
	const safe = traceId.replace(/'/g, "''");
	const rows = await runSql(
		databaseId,
		`SELECT trace_id, span_id, parent_id, name, kind, start_ms, end_ms, duration_ms, outcome, error, attributes
		 FROM spans WHERE trace_id='${safe}' ORDER BY start_ms ASC`
	);
	return rows as unknown as SpanRow[];
}

const VITE_RUNNER_MARKER = "__VITE_RUNNER_OBJECT__";

/**
 * Drop the Vite dev module-runner's internal plumbing spans and re-parent their
 * real children up. In `vite dev`, user code runs inside a runner Durable
 * Object, so every invocation is wrapped with a `durable_object_subrequest` →
 * `jsrpc (executeCallback on __VITE_RUNNER_OBJECT__)` chain that isn't the
 * user's code. We hide those (and the DO-subrequest that dispatches into them)
 * so the waterfall shows only the worker's actual spans. No-op outside Vite dev.
 */
export function stripDevRunnerSpans(spans: SpanRow[]): SpanRow[] {
	const runnerIds = new Set<string>();
	for (const s of spans) {
		if ((s.attributes ?? "").includes(VITE_RUNNER_MARKER)) {
			runnerIds.add(s.span_id);
		}
	}
	if (runnerIds.size === 0) {
		return spans; // not a Vite dev trace — leave untouched
	}

	// Also hide the durable_object_subrequest that dispatches into a runner span.
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
	const resolveParent = (s: SpanRow): string | null => {
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
 * trace waterfall layout. Children are grouped by parent_id and sorted by
 * start offset; orphans are attached to the root.
 *
 * When `hideDevRunner` is set, Vite dev module-runner plumbing spans are removed
 * (see {@link stripDevRunnerSpans}).
 */
export function buildSpanTree(
	spans: SpanRow[],
	rootSpanId: string,
	hideDevRunner = false
): LayoutSpan[] {
	const source = hideDevRunner ? stripDevRunnerSpans(spans) : spans;
	// Span times are absolute epoch ms (so spans from different invocations of a
	// distributed trace share a timeline). Re-base everything to the earliest
	// span start so the waterfall renders offsets from the trace start.
	const t0 = source.length ? Math.min(...source.map((s) => s.start_ms)) : 0;
	const rebased = source.map((s) => ({
		...s,
		start_ms: s.start_ms - t0,
		end_ms: s.end_ms != null ? s.end_ms - t0 : null,
	}));

	const byId = new Map(rebased.map((s) => [s.span_id, s]));
	const childrenOf = new Map<string, SpanRow[]>();

	for (const s of rebased) {
		if (s.span_id === rootSpanId) {
			continue;
		}
		let parent = s.parent_id ?? rootSpanId;
		if (!byId.has(parent)) {
			parent = rootSpanId;
		}
		const arr = childrenOf.get(parent) ?? [];
		arr.push(s);
		childrenOf.set(parent, arr);
	}

	for (const arr of childrenOf.values()) {
		arr.sort((a, b) => a.start_ms - b.start_ms);
	}

	const out: LayoutSpan[] = [];
	const visit = (spanId: string, depth: number, layoutId: string) => {
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

	const root = byId.get(rootSpanId) ?? rebased[0];
	if (root) {
		visit(root.span_id, 0, "0");
	}
	return out;
}

/** Color/icon kind for a span. */
export function spanKind(span: SpanRow): string {
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

/** Parse the JSON attributes column into an object (or empty). */
export function parseAttributes(span: SpanRow): Record<string, unknown> {
	if (!span.attributes) {
		return {};
	}
	try {
		const parsed = JSON.parse(span.attributes);
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

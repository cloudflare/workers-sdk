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
	/** offset from trace start, in ms */
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
 * Find the D1 database that holds the trace store among a worker's bindings.
 * Matches by binding/database name containing "trace".
 */
export function findTraceDatabaseId(
	bindings: LocalExplorerWorkerBindings | undefined
): string | undefined {
	const candidates = bindings?.d1 ?? [];
	const match = candidates.find((db) =>
		/trace/i.test(db.bindingName ?? "")
	);
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
	const where: string[] = [];

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
	const rows = await runSql(
		databaseId,
		`SELECT trace_id, root_span_id, name, duration_ms, outcome, status_code, error, span_count, created_at
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

/** Distinct attribute/tag keys present across all spans (for the tag filter). */
export async function getTagKeys(databaseId: string): Promise<string[]> {
	const rows = await runSql(
		databaseId,
		`SELECT DISTINCT j.key AS k FROM spans s, json_each(s.attributes) j
		 WHERE s.attributes IS NOT NULL ORDER BY k LIMIT 200`
	);
	return rows.map((r) => String(r.k)).filter(Boolean);
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

/**
 * Flatten spans into a depth-ordered list (DFS), mirroring the dashboard's
 * trace waterfall layout. Children are grouped by parent_id and sorted by
 * start offset; orphans are attached to the root.
 */
export function buildSpanTree(
	spans: SpanRow[],
	rootSpanId: string
): LayoutSpan[] {
	const byId = new Map(spans.map((s) => [s.span_id, s]));
	const childrenOf = new Map<string, SpanRow[]>();

	for (const s of spans) {
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

	const root = byId.get(rootSpanId) ?? spans[0];
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

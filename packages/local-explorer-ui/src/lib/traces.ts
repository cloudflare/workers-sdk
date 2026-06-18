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

/** Fetch recent traces (most recent first). */
export async function listTraces(
	databaseId: string,
	limit = 100
): Promise<TraceRow[]> {
	const rows = await runSql(
		databaseId,
		`SELECT trace_id, root_span_id, name, duration_ms, outcome, status_code, error, span_count, created_at
		 FROM traces ORDER BY created_at DESC, ROWID DESC LIMIT ${Number(limit)}`
	);
	return rows as unknown as TraceRow[];
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
	const visit = (spanId: string, depth: number) => {
		const span = byId.get(spanId);
		if (!span) {
			return;
		}
		const children = childrenOf.get(spanId) ?? [];
		out.push({ ...span, depth, hasChildren: children.length > 0 });
		for (const child of children) {
			visit(child.span_id, depth + 1);
		}
	};

	const root = byId.get(rootSpanId) ?? spans[0];
	if (root) {
		visit(root.span_id, 0);
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

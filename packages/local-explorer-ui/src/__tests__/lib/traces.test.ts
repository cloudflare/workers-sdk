import { beforeEach, describe, test, vi } from "vitest";
import { d1RawDatabaseQuery } from "../../api";
import {
	buildSpanTree,
	findTraceDatabaseId,
	isTraceStoreBinding,
	listEvents,
	listTraces,
	parseAttributes,
	spanKind,
	type SpanRow,
} from "../../lib/traces";

vi.mock("../../api", () => ({
	d1RawDatabaseQuery: vi.fn(async () => ({
		data: { result: [{ results: { columns: [], rows: [] } }] },
	})),
}));

const mockQuery = vi.mocked(d1RawDatabaseQuery);

/** Pull the SQL string passed to the (only) d1RawDatabaseQuery call. */
function lastSql(): string {
	const call = mockQuery.mock.calls.at(-1)?.[0] as
		| { body: { sql: string } }
		| undefined;
	return call?.body.sql ?? "";
}

function span(partial: Partial<SpanRow> & { span_id: string }): SpanRow {
	return {
		trace_id: "t1",
		parent_id: null,
		name: null,
		kind: null,
		start_ms: 0,
		end_ms: null,
		duration_ms: 0,
		outcome: null,
		error: null,
		attributes: null,
		...partial,
	};
}

beforeEach(() => {
	mockQuery.mockClear();
});

describe("findTraceDatabaseId", () => {
	test("returns undefined when there are no d1 bindings", ({ expect }) => {
		expect(findTraceDatabaseId(undefined)).toBeUndefined();
		expect(findTraceDatabaseId({ d1: [] })).toBeUndefined();
	});

	test("matches a binding whose name contains 'trace' (case-insensitive)", ({
		expect,
	}) => {
		const id = findTraceDatabaseId({
			d1: [
				{ bindingName: "DB", id: "db-id" },
				{ bindingName: "WOBS_TRACES", id: "trace-id" },
			],
		} as never);
		expect(id).toBe("trace-id");
	});

	test("returns undefined when no binding name matches", ({ expect }) => {
		const id = findTraceDatabaseId({
			d1: [{ bindingName: "CACHE", id: "x" }],
		} as never);
		expect(id).toBeUndefined();
	});

	test("prefers the exact WOBS_TRACES binding over a fuzzy 'trace' match", ({
		expect,
	}) => {
		const id = findTraceDatabaseId({
			d1: [
				{ bindingName: "MY_TRACES_TABLE", id: "fuzzy" },
				{ bindingName: "WOBS_TRACES", id: "exact" },
			],
		} as never);
		expect(id).toBe("exact");
	});
});

describe("isTraceStoreBinding", () => {
	test("matches only the exact internal binding name", ({ expect }) => {
		expect(isTraceStoreBinding({ bindingName: "WOBS_TRACES" })).toBe(true);
		expect(isTraceStoreBinding({ bindingName: "DB" })).toBe(false);
		expect(isTraceStoreBinding({ bindingName: "MY_TRACES" })).toBe(false);
		expect(isTraceStoreBinding({})).toBe(false);
	});
});

describe("spanKind", () => {
	test("uses explicit kind when present", ({ expect }) => {
		expect(spanKind(span({ span_id: "s", kind: "d1" }))).toBe("d1");
	});

	test("infers kind from name when kind is absent", ({ expect }) => {
		expect(spanKind(span({ span_id: "s", name: "KV get" }))).toBe("kv");
		expect(spanKind(span({ span_id: "s", name: "D1 query" }))).toBe("d1");
		expect(spanKind(span({ span_id: "s", name: "fetch example.com" }))).toBe(
			"fetch"
		);
		expect(spanKind(span({ span_id: "s", name: "R2 put" }))).toBe("r2");
	});

	test("falls back to 'span'", ({ expect }) => {
		expect(spanKind(span({ span_id: "s", name: "something" }))).toBe("span");
		expect(spanKind(span({ span_id: "s" }))).toBe("span");
	});
});

describe("parseAttributes", () => {
	test("returns {} when no attributes", ({ expect }) => {
		expect(parseAttributes(span({ span_id: "s" }))).toEqual({});
	});

	test("parses a JSON object", ({ expect }) => {
		expect(
			parseAttributes(span({ span_id: "s", attributes: '{"a":1,"b":"x"}' }))
		).toEqual({ a: 1, b: "x" });
	});

	test("returns {} for invalid JSON or non-object", ({ expect }) => {
		expect(
			parseAttributes(span({ span_id: "s", attributes: "not json" }))
		).toEqual({});
		expect(parseAttributes(span({ span_id: "s", attributes: "123" }))).toEqual(
			{}
		);
	});
});

describe("buildSpanTree", () => {
	test("produces depth-ordered DFS layout with layout ids", ({ expect }) => {
		const spans = [
			span({ span_id: "root", start_ms: 0 }),
			span({ span_id: "a", parent_id: "root", start_ms: 10 }),
			span({ span_id: "a1", parent_id: "a", start_ms: 15 }),
			span({ span_id: "b", parent_id: "root", start_ms: 5 }),
		];
		const tree = buildSpanTree(spans, "root");
		// children sorted by start: b (5) before a (10)
		expect(tree.map((s) => s.span_id)).toEqual(["root", "b", "a", "a1"]);
		expect(tree.map((s) => s.depth)).toEqual([0, 1, 1, 2]);
		expect(tree.map((s) => s.layoutId)).toEqual(["0", "0.0", "0.1", "0.1.0"]);
		expect(tree.find((s) => s.span_id === "a")?.hasChildren).toBe(true);
		expect(tree.find((s) => s.span_id === "b")?.hasChildren).toBe(false);
	});

	test("attaches orphans (unknown parent) to the root", ({ expect }) => {
		const spans = [
			span({ span_id: "root" }),
			span({ span_id: "orphan", parent_id: "missing", start_ms: 1 }),
		];
		const tree = buildSpanTree(spans, "root");
		expect(tree.map((s) => s.span_id)).toEqual(["root", "orphan"]);
		expect(tree[1]?.depth).toBe(1);
	});
});

describe("listTraces SQL", () => {
	test("no filters -> plain ordered/limited select", async ({ expect }) => {
		await listTraces("db");
		const sql = lastSql();
		expect(sql).not.toContain("WHERE");
		expect(sql).toContain("ORDER BY created_at DESC, ROWID DESC LIMIT 100");
	});

	test("status:error builds the error predicate", async ({ expect }) => {
		await listTraces("db", { status: "error" });
		expect(lastSql()).toContain("status_code, 0) >= 400");
	});

	test("kind filter restricts to matching spans", async ({ expect }) => {
		await listTraces("db", { kind: "d1" });
		expect(lastSql()).toContain(
			"trace_id IN (SELECT trace_id FROM spans WHERE kind = 'd1')"
		);
	});

	test("duration clause inlines the comparator + number", async ({
		expect,
	}) => {
		await listTraces("db", {
			clauses: [{ field: "duration", op: ">", value: "100" }],
		});
		expect(lastSql()).toContain("COALESCE(duration_ms, 0) > 100");
	});

	test("non-numeric duration clause is ignored", async ({ expect }) => {
		await listTraces("db", {
			clauses: [{ field: "duration", op: ">", value: "abc" }],
		});
		expect(lastSql()).not.toContain("duration_ms, 0) >");
	});

	test("attribute clause uses json_each lookup", async ({ expect }) => {
		await listTraces("db", {
			clauses: [{ field: "db.query.text", op: "=", value: "orders" }],
		});
		expect(lastSql()).toContain("json_each(s.attributes)");
		expect(lastSql()).toContain("j.key = 'db.query.text'");
		expect(lastSql()).toContain("j.value LIKE '%orders%'");
	});

	test("escapes single quotes to prevent SQL injection", async ({ expect }) => {
		await listTraces("db", { search: "o'brien" });
		const sql = lastSql();
		expect(sql).toContain("o''brien");
		expect(sql).not.toContain("o'brien'");
	});

	test("respects custom limit", async ({ expect }) => {
		await listTraces("db", { limit: 5 });
		expect(lastSql()).toContain("LIMIT 5");
	});
});

describe("listEvents SQL", () => {
	test("level + operation + search build the where clause", async ({
		expect,
	}) => {
		await listEvents("db", {
			level: "error",
			operation: "/checkout",
			search: "boom",
		});
		const sql = lastSql();
		expect(sql).toContain("level = 'error'");
		expect(sql).toContain("operation LIKE '%/checkout%'");
		expect(sql).toContain("message LIKE '%boom%'");
		expect(sql).toContain("LIMIT 200");
	});

	test("level 'all' is treated as no filter", async ({ expect }) => {
		await listEvents("db", { level: "all" });
		expect(lastSql()).not.toContain("level =");
	});

	test("escapes single quotes in event search", async ({ expect }) => {
		await listEvents("db", { search: "it's" });
		expect(lastSql()).toContain("it''s");
	});
});

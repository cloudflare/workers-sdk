import { describe, test } from "vitest";
import {
	durationClauseSql,
	logColumnClauseSql,
	traceAttrClauseSql,
} from "../../utils/observability";
import {
	clauseOpLabel,
	clauseOpNeedsValue,
	defaultOpForType,
	operatorsForType,
	parseTraceQuery,
} from "../../utils/observability-query";
import type { QueryClause } from "../../utils/observability-query";

function clause(partial: Partial<QueryClause>): QueryClause {
	return { field: "db.query.text", op: "~", value: "orders", ...partial };
}

describe("operatorsForType", () => {
	test("string keys get substring/prefix/equality/presence operators", ({
		expect,
	}) => {
		const ops = operatorsForType("string").map((o) => o.op);
		expect(ops).toEqual(["~", "!~", "=", "!=", "^", "exists", "!exists"]);
	});

	test("number keys get comparators only (no substring/presence)", ({
		expect,
	}) => {
		const ops = operatorsForType("number").map((o) => o.op);
		expect(ops).toEqual(["=", "!=", ">", ">=", "<", "<="]);
	});
});

describe("operator metadata helpers", () => {
	test("defaultOpForType is contains for strings, > for numbers", ({
		expect,
	}) => {
		expect(defaultOpForType("string")).toBe("~");
		expect(defaultOpForType("number")).toBe(">");
	});

	test("clauseOpLabel returns readable labels", ({ expect }) => {
		expect(clauseOpLabel("~")).toBe("contains");
		expect(clauseOpLabel("!exists")).toBe("does not exist");
		expect(clauseOpLabel(">=")).toBe("greater or equal");
	});

	test("presence operators need no value", ({ expect }) => {
		expect(clauseOpNeedsValue("exists")).toBe(false);
		expect(clauseOpNeedsValue("!exists")).toBe(false);
		expect(clauseOpNeedsValue("~")).toBe(true);
		expect(clauseOpNeedsValue("=")).toBe(true);
	});
});

describe("parseTraceQuery clauses", () => {
	test("bare attr:value becomes a contains clause", ({ expect }) => {
		const { clauses } = parseTraceQuery("db.query.text:orders");
		expect(clauses).toEqual([
			{ field: "db.query.text", op: "~", value: "orders" },
		]);
	});

	test("dur: keeps its comparator", ({ expect }) => {
		expect(parseTraceQuery("dur:>=100").clauses).toEqual([
			{ field: "duration", op: ">=", value: "100" },
		]);
	});
});

describe("durationClauseSql", () => {
	test("emits a numeric comparison for comparators", ({ expect }) => {
		const f = durationClauseSql(
			clause({ field: "duration", op: ">", value: "100" })
		);
		expect(f?.sql).toContain("> ?");
		expect(f?.params).toEqual([100]);
	});

	test("supports not-equal", ({ expect }) => {
		const f = durationClauseSql(
			clause({ field: "duration", op: "!=", value: "5" })
		);
		expect(f?.sql).toContain("!= ?");
		expect(f?.params).toEqual([5]);
	});

	test("skips non-numeric operators and non-numeric values", ({ expect }) => {
		expect(
			durationClauseSql(clause({ field: "duration", op: "~", value: "100" }))
		).toBeNull();
		expect(
			durationClauseSql(clause({ field: "duration", op: ">", value: "abc" }))
		).toBeNull();
	});
});

describe("traceAttrClauseSql", () => {
	test("contains uses an IN sub-select with %v% LIKE", ({ expect }) => {
		const f = traceAttrClauseSql(clause({ op: "~", value: "orders" }));
		expect(f?.sql).toContain("s.trace_id IN");
		expect(f?.sql).toContain("j.value LIKE ?");
		expect(f?.params).toEqual(["db.query.text", "%orders%"]);
	});

	test("does-not-contain negates with NOT IN", ({ expect }) => {
		const f = traceAttrClauseSql(clause({ op: "!~", value: "orders" }));
		expect(f?.sql).toContain("s.trace_id NOT IN");
		expect(f?.params).toEqual(["db.query.text", "%orders%"]);
	});

	test("starts-with uses a v% LIKE", ({ expect }) => {
		const f = traceAttrClauseSql(clause({ op: "^", value: "SELECT" }));
		expect(f?.params).toEqual(["db.query.text", "SELECT%"]);
	});

	test("equals uses exact match", ({ expect }) => {
		const f = traceAttrClauseSql(clause({ op: "=", value: "GET" }));
		expect(f?.sql).toContain("j.value = ?");
		expect(f?.params).toEqual(["db.query.text", "GET"]);
	});

	test("exists / does-not-exist match on key presence, no value", ({
		expect,
	}) => {
		const exists = traceAttrClauseSql(clause({ op: "exists", value: "" }));
		expect(exists?.sql).toContain("s.trace_id IN");
		expect(exists?.sql).not.toContain("j.value");
		expect(exists?.params).toEqual(["db.query.text"]);

		const missing = traceAttrClauseSql(clause({ op: "!exists", value: "" }));
		expect(missing?.sql).toContain("s.trace_id NOT IN");
		expect(missing?.params).toEqual(["db.query.text"]);
	});

	test("returns null for a value operator with an empty value", ({
		expect,
	}) => {
		expect(traceAttrClauseSql(clause({ op: "~", value: "  " }))).toBeNull();
	});
});

describe("logColumnClauseSql", () => {
	test("contains / does-not-contain map to LIKE / NOT LIKE", ({ expect }) => {
		expect(
			logColumnClauseSql("l.operation", clause({ op: "~", value: "GET" }))
		).toEqual({
			sql: "l.operation LIKE ?",
			params: ["%GET%"],
		});
		expect(
			logColumnClauseSql("l.operation", clause({ op: "!~", value: "GET" }))
		).toEqual({ sql: "l.operation NOT LIKE ?", params: ["%GET%"] });
	});

	test("starts-with / equals / not-equal", ({ expect }) => {
		expect(
			logColumnClauseSql("sp.service", clause({ op: "^", value: "api" }))
		).toEqual({
			sql: "sp.service LIKE ?",
			params: ["api%"],
		});
		expect(
			logColumnClauseSql("l.level", clause({ op: "=", value: "error" }))
		).toEqual({
			sql: "l.level = ?",
			params: ["error"],
		});
		expect(
			logColumnClauseSql("l.level", clause({ op: "!=", value: "info" }))
		).toEqual({
			sql: "l.level != ?",
			params: ["info"],
		});
	});

	test("presence maps to IS NULL / IS NOT NULL with no params", ({
		expect,
	}) => {
		expect(
			logColumnClauseSql("sp.service", clause({ op: "exists", value: "" }))
		).toEqual({
			sql: "sp.service IS NOT NULL",
			params: [],
		});
		expect(
			logColumnClauseSql("sp.service", clause({ op: "!exists", value: "" }))
		).toEqual({ sql: "sp.service IS NULL", params: [] });
	});

	test("returns null when a value operator has no value", ({ expect }) => {
		expect(
			logColumnClauseSql("l.message", clause({ op: "~", value: "" }))
		).toBeNull();
	});
});

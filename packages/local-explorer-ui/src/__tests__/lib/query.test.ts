import { describe, test } from "vitest";
import { parseEventQuery, parseTraceQuery } from "../../lib/query";

describe("parseTraceQuery", () => {
	test("empty input yields empty text and no clauses", ({ expect }) => {
		expect(parseTraceQuery("")).toEqual({ text: "", clauses: [] });
		expect(parseTraceQuery("   ")).toEqual({ text: "", clauses: [] });
	});

	test("bare words become free text", ({ expect }) => {
		const q = parseTraceQuery("hello world");
		expect(q.text).toBe("hello world");
		expect(q.clauses).toEqual([]);
		expect(q.status).toBeUndefined();
		expect(q.kind).toBeUndefined();
	});

	test("quoted phrases are unquoted into free text", ({ expect }) => {
		const q = parseTraceQuery('"GET /orders" foo');
		expect(q.text).toBe("GET /orders foo");
	});

	test("status: maps aliases to success/error", ({ expect }) => {
		expect(parseTraceQuery("status:error").status).toBe("error");
		expect(parseTraceQuery("status:err").status).toBe("error");
		expect(parseTraceQuery("status:fail").status).toBe("error");
		expect(parseTraceQuery("status:success").status).toBe("success");
		expect(parseTraceQuery("status:ok").status).toBe("success");
		expect(parseTraceQuery("status:200").status).toBe("success");
	});

	test("status: is case-insensitive and ignores unknown values", ({
		expect,
	}) => {
		expect(parseTraceQuery("status:ERROR").status).toBe("error");
		expect(parseTraceQuery("status:teapot").status).toBeUndefined();
	});

	test("kind: and type: both set kind (lowercased)", ({ expect }) => {
		expect(parseTraceQuery("kind:D1").kind).toBe("d1");
		expect(parseTraceQuery("type:kv").kind).toBe("kv");
	});

	test("dur:/duration: produce a duration clause with comparator", ({
		expect,
	}) => {
		expect(parseTraceQuery("dur:>100").clauses).toEqual([
			{ field: "duration", op: ">", value: "100" },
		]);
		expect(parseTraceQuery("duration:<=50").clauses).toEqual([
			{ field: "duration", op: "<=", value: "50" },
		]);
	});

	test("bare duration value defaults to = comparator", ({ expect }) => {
		expect(parseTraceQuery("dur:100").clauses).toEqual([
			{ field: "duration", op: "=", value: "100" },
		]);
	});

	test("unknown key:value becomes an attribute clause", ({ expect }) => {
		expect(parseTraceQuery("db.query.text:orders").clauses).toEqual([
			{ field: "db.query.text", op: "=", value: "orders" },
		]);
	});

	test("token with empty value falls back to free text", ({ expect }) => {
		// trailing colon -> no value -> treated as free text
		const q = parseTraceQuery("status:");
		expect(q.status).toBeUndefined();
		expect(q.text).toBe("status:");
	});

	test("leading colon is not a key:value token", ({ expect }) => {
		const q = parseTraceQuery(":foo");
		expect(q.clauses).toEqual([]);
		expect(q.text).toBe(":foo");
	});

	test("combines free text, status, kind, and clauses together", ({
		expect,
	}) => {
		const q = parseTraceQuery("checkout status:error kind:d1 dur:>=200");
		expect(q.text).toBe("checkout");
		expect(q.status).toBe("error");
		expect(q.kind).toBe("d1");
		expect(q.clauses).toEqual([{ field: "duration", op: ">=", value: "200" }]);
	});

	// Known limitation: tokenization splits on whitespace before handling
	// quotes, so only a token that *starts* with `"` is treated as a quoted
	// phrase. `key:"value with spaces"` does NOT keep the spaces together.
	test("quoted attribute values with spaces are NOT joined (known limitation)", ({
		expect,
	}) => {
		const q = parseTraceQuery('db.query.text:"select * from orders"');
		expect(q.clauses).toEqual([
			{ field: "db.query.text", op: "=", value: '"select' },
		]);
		expect(q.text).toBe('* from orders"');
	});
});

describe("parseEventQuery", () => {
	test("empty input yields empty text", ({ expect }) => {
		expect(parseEventQuery("")).toEqual({ text: "" });
	});

	test("level:/lvl: set level (lowercased)", ({ expect }) => {
		expect(parseEventQuery("level:ERROR").level).toBe("error");
		expect(parseEventQuery("lvl:warn").level).toBe("warn");
	});

	test("op:/operation:/route: set operation (case preserved)", ({ expect }) => {
		expect(parseEventQuery("op:/checkout").operation).toBe("/checkout");
		expect(parseEventQuery("operation:/Orders").operation).toBe("/Orders");
		expect(parseEventQuery("route:/api").operation).toBe("/api");
	});

	test("unknown key:value tokens fall back to free text", ({ expect }) => {
		const q = parseEventQuery("foo:bar baz");
		expect(q.level).toBeUndefined();
		expect(q.operation).toBeUndefined();
		expect(q.text).toBe("foo:bar baz");
	});

	test("combines level, operation, and free text", ({ expect }) => {
		const q = parseEventQuery("timeout level:error op:/checkout");
		expect(q.level).toBe("error");
		expect(q.operation).toBe("/checkout");
		expect(q.text).toBe("timeout");
	});
});

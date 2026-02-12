import { describe, expect, test } from "vitest";
import {
	escapeSqlValue,
	tokenizeSQL,
	transformStudioArrayBasedResult,
} from "../../utils/studio";

describe("escapeSqlValue", () => {
	test("undefined returns `DEFAULT`", () => {
		expect(escapeSqlValue(undefined)).toBe("DEFAULT");
	});

	test("null returns `NULL`", () => {
		expect(escapeSqlValue(null)).toBe("NULL");
	});

	test("string is escaped with single quotes", () => {
		expect(escapeSqlValue("hello")).toBe("'hello'");
	});

	test("string with single quotes is escaped correctly", () => {
		expect(escapeSqlValue("O'Brien")).toBe("'O''Brien'");
	});

	test("empty string is escaped", () => {
		expect(escapeSqlValue("")).toBe("''");
	});

	test("string with multiple single quotes", () => {
		expect(escapeSqlValue("it's a 'test'")).toBe("'it''s a ''test'''");
	});

	test("number is converted to string", () => {
		expect(escapeSqlValue(42)).toBe("42");
	});

	test("negative number is converted to string", () => {
		expect(escapeSqlValue(-3.14)).toBe("-3.14");
	});

	test("zero is converted to string", () => {
		expect(escapeSqlValue(0)).toBe("0");
	});

	test("bigint is converted to string", () => {
		expect(escapeSqlValue(BigInt(9007199254740991))).toBe("9007199254740991");
	});

	test("ArrayBuffer throws", () => {
		expect(() => escapeSqlValue(new ArrayBuffer(8))).toThrow(
			"Blob escape is not supported yet"
		);
	});

	test("Array throws", () => {
		expect(() => escapeSqlValue([1, 2, 3])).toThrow(
			"Blob escape is not supported yet"
		);
	});

	test("unrecognized type throws", () => {
		expect(() => escapeSqlValue(true)).toThrow("is unrecognized type of value");
	});
});

describe("tokenizeSQL", () => {
	test("simple `SELECT` query", () => {
		const sql = "SELECT * FROM customers";
		const tokens = tokenizeSQL(sql, "sqlite");
		expect(tokens).toEqual([
			{ type: "IDENTIFIER", value: "SELECT" },
			{ type: "WHITESPACE", value: " " },
			{ type: "OPERATOR", value: "*" },
			{ type: "WHITESPACE", value: " " },
			{ type: "IDENTIFIER", value: "FROM" },
			{ type: "WHITESPACE", value: " " },
			{ type: "IDENTIFIER", value: "customers" },
		]);
		expect(tokens.map((t) => t.value).join("")).toBe(sql);
	});

	test("double-quoted identifiers", () => {
		const sql = `SELECT "customer"."name" FROM "customers"`;
		const tokens = tokenizeSQL(sql, "sqlite");
		expect(tokens).toEqual([
			{ type: "IDENTIFIER", value: "SELECT" },
			{ type: "WHITESPACE", value: " " },
			{ type: "IDENTIFIER", value: '"customer"' },
			{ type: "PUNCTUATION", value: "." },
			{ type: "IDENTIFIER", value: '"name"' },
			{ type: "WHITESPACE", value: " " },
			{ type: "IDENTIFIER", value: "FROM" },
			{ type: "WHITESPACE", value: " " },
			{ type: "IDENTIFIER", value: '"customers"' },
		]);
		expect(tokens.map((t) => t.value).join("")).toBe(sql);
	});

	test("bracket-quoted identifiers", () => {
		const sql = `SELECT [customer].[first name] FROM [customers]`;
		const tokens = tokenizeSQL(sql, "sqlite");
		expect(tokens).toEqual([
			{ type: "IDENTIFIER", value: "SELECT" },
			{ type: "WHITESPACE", value: " " },
			{ type: "IDENTIFIER", value: "[customer]" },
			{ type: "PUNCTUATION", value: "." },
			{ type: "IDENTIFIER", value: "[first name]" },
			{ type: "WHITESPACE", value: " " },
			{ type: "IDENTIFIER", value: "FROM" },
			{ type: "WHITESPACE", value: " " },
			{ type: "IDENTIFIER", value: "[customers]" },
		]);
		expect(tokens.map((t) => t.value).join("")).toBe(sql);
	});

	test("string literals", () => {
		const sql = `SELECT 'Hello' FROM "t" WHERE "name" = 'John Doe'`;
		const tokens = tokenizeSQL(sql, "sqlite");

		const stringTokens = tokens.filter((t) => t.type === "STRING");
		expect(stringTokens).toEqual([
			{ type: "STRING", value: "'Hello'" },
			{ type: "STRING", value: "'John Doe'" },
		]);
		expect(tokens.map((t) => t.value).join("")).toBe(sql);
	});

	test("number literals", () => {
		const sql = `SELECT 123.45 FROM "t" WHERE "age" = 30`;
		const tokens = tokenizeSQL(sql, "sqlite");

		const numberTokens = tokens.filter((t) => t.type === "NUMBER");
		expect(numberTokens).toEqual([
			{ type: "NUMBER", value: "123.45" },
			{ type: "NUMBER", value: "30" },
		]);
		expect(tokens.map((t) => t.value).join("")).toBe(sql);
	});

	test("placeholders", () => {
		const sql = `SELECT * FROM customers WHERE name = :name`;
		const tokens = tokenizeSQL(sql, "sqlite");

		const placeholderTokens = tokens.filter((t) => t.type === "PLACEHOLDER");
		expect(placeholderTokens).toEqual([
			{ type: "PLACEHOLDER", value: ":name" },
		]);
		expect(tokens.map((t) => t.value).join("")).toBe(sql);
	});

	test("placeholders inside strings and comments are not treated as placeholders", () => {
		const sql = `SELECT * FROM t WHERE name = ':name' AND "code" =:code -- only :code is a placeholder`;
		const tokens = tokenizeSQL(sql, "sqlite");

		const placeholderTokens = tokens.filter((t) => t.type === "PLACEHOLDER");
		expect(placeholderTokens).toEqual([
			{ type: "PLACEHOLDER", value: ":code" },
		]);
		expect(tokens.map((t) => t.value).join("")).toBe(sql);
	});

	test("line comments", () => {
		const sql = `SELECT * FROM t -- this is a comment`;
		const tokens = tokenizeSQL(sql, "sqlite");

		const commentTokens = tokens.filter((t) => t.type === "COMMENT");
		expect(commentTokens).toEqual([
			{ type: "COMMENT", value: "-- this is a comment" },
		]);
		expect(tokens.map((t) => t.value).join("")).toBe(sql);
	});

	test("block comments", () => {
		const sql = `SELECT /* a block comment */ * FROM t`;
		const tokens = tokenizeSQL(sql, "sqlite");

		const commentTokens = tokens.filter((t) => t.type === "COMMENT");
		expect(commentTokens).toEqual([
			{ type: "COMMENT", value: "/* a block comment */" },
		]);
		expect(tokens.map((t) => t.value).join("")).toBe(sql);
	});

	test("operators and punctuation", () => {
		const sql = `SELECT * FROM t WHERE name = 'test' AND age > 30;`;
		const tokens = tokenizeSQL(sql, "sqlite");

		const opTokens = tokens.filter((t) => t.type === "OPERATOR");
		expect(opTokens).toEqual([
			{ type: "OPERATOR", value: "*" },
			{ type: "OPERATOR", value: "=" },
			{ type: "OPERATOR", value: ">" },
		]);

		const punctTokens = tokens.filter((t) => t.type === "PUNCTUATION");
		expect(punctTokens).toEqual([{ type: "PUNCTUATION", value: ";" }]);

		expect(tokens.map((t) => t.value).join("")).toBe(sql);
	});

	test("unknown token accumulation", () => {
		const sql = `SELECT * FROM t ### unknown`;
		const tokens = tokenizeSQL(sql, "sqlite");

		const unknownTokens = tokens.filter((t) => t.type === "UNKNOWN");
		expect(unknownTokens).toEqual([{ type: "UNKNOWN", value: "###" }]);
		expect(tokens.map((t) => t.value).join("")).toBe(sql);
	});

	test("PostgreSQL cast operator", () => {
		const sql = `SELECT spend::float FROM t`;
		const tokens = tokenizeSQL(sql, "sqlite");

		expect(tokens).toContainEqual({ type: "OPERATOR", value: "::" });
		expect(tokens.map((t) => t.value).join("")).toBe(sql);
	});

	test("`WITH` and subquery", () => {
		const sql = `WITH cte AS (SELECT * FROM t) SELECT * FROM cte`;
		const tokens = tokenizeSQL(sql, "sqlite");

		expect(tokens[0]).toEqual({ type: "IDENTIFIER", value: "WITH" });
		expect(tokens).toContainEqual({ type: "PUNCTUATION", value: "(" });
		expect(tokens).toContainEqual({ type: "PUNCTUATION", value: ")" });
		expect(tokens.map((t) => t.value).join("")).toBe(sql);
	});

	test("`IN` clause", () => {
		const sql = `SELECT * FROM t WHERE age IN (25, 30, 35)`;
		const tokens = tokenizeSQL(sql, "sqlite");

		expect(tokens).toContainEqual({ type: "IDENTIFIER", value: "IN" });
		expect(tokens.map((t) => t.value).join("")).toBe(sql);
	});

	test("empty string returns empty tokens", () => {
		const tokens = tokenizeSQL("", "sqlite");
		expect(tokens).toEqual([]);
	});
});

describe("transformStudioArrayBasedResult", () => {
	test("transforms headers and rows", () => {
		const result = transformStudioArrayBasedResult({
			headers: ["id", "name"],
			rows: [
				[1, "Alice"],
				[2, "Bob"],
			],
			transformHeader: (header) => ({
				displayName: header,
				name: header,
			}),
		});

		expect(result.headers).toEqual([
			{ name: "id", displayName: "id" },
			{ name: "name", displayName: "name" },
		]);
		expect(result.rows).toEqual([
			{ id: 1, name: "Alice" },
			{ id: 2, name: "Bob" },
		]);
	});

	test("deduplicates column names", () => {
		const result = transformStudioArrayBasedResult({
			headers: ["a", "a", "a"],
			rows: [[1, 2, 3]],
			transformHeader: (header) => ({
				displayName: header,
				name: header,
			}),
		});

		expect(result.headers.map((h) => h.name)).toEqual(["a", "a_1", "a_2"]);
		expect(result.rows).toEqual([{ a: 1, a_1: 2, a_2: 3 }]);
	});

	test("applies transformValue callback", () => {
		const result = transformStudioArrayBasedResult({
			headers: ["val"],
			rows: [[42]],
			transformHeader: (header) => ({
				displayName: header,
				name: header,
			}),
			transformValue: (value) =>
				typeof value === "number" ? value * 2 : value,
		});

		expect(result.rows).toEqual([{ val: 84 }]);
	});

	test("handles empty result set", () => {
		const result = transformStudioArrayBasedResult({
			headers: ["id"],
			rows: [],
			transformHeader: (header) => ({
				displayName: header,
				name: header,
			}),
		});

		expect(result.headers).toEqual([{ name: "id", displayName: "id" }]);
		expect(result.rows).toEqual([]);
	});

	test("handles empty headers", () => {
		const result = transformStudioArrayBasedResult({
			headers: [],
			rows: [],
			transformHeader: (header: string) => ({
				displayName: header,
				name: header,
			}),
		});

		expect(result.headers).toEqual([]);
		expect(result.rows).toEqual([]);
	});

	test("passes header index to transformHeader", () => {
		const result = transformStudioArrayBasedResult({
			headers: ["a", "b"],
			rows: [[1, 2]],
			transformHeader: (header, idx) => ({
				displayName: header,
				name: `${header}_${idx}`,
			}),
		});

		expect(result.headers.map((h) => h.name)).toEqual(["a_0", "b_1"]);
	});
});

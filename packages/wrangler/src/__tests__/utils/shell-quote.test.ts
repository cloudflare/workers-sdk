import { describe, it, expect } from "vitest";
import { quote, parse } from "../../utils/shell-quote";

describe("quote", () => {
	it("returns unquoted string for safe arguments", () => {
		expect(quote(["hello"])).toBe("hello");
	});

	it("wraps strings with spaces in quotes", () => {
		expect(quote(["hello world"])).toBe("'hello world'");
	});

	it("escapes special characters", () => {
		expect(quote(["a$b"])).toBe("a\\$b");
	});

	it("handles single quotes by wrapping in double quotes", () => {
		expect(quote(["a'b"])).toBe('"a\'b"');
	});

	it("handles empty array", () => {
		expect(quote([])).toBe("");
	});

	it("handles multiple arguments", () => {
		expect(quote(["a", "b c"])).toBe("a 'b c'");
	});
});

describe("parse", () => {
	it("parses simple arguments", () => {
		expect(parse("foo bar")).toEqual(["foo", "bar"]);
	});

	it("parses single-quoted strings", () => {
		expect(parse("'hello world'")).toEqual(["hello world"]);
	});

	it("parses double-quoted strings", () => {
		expect(parse('"hello world"')).toEqual(["hello world"]);
	});

	it("handles escaped characters", () => {
		expect(parse("a\\ b")).toEqual(["a b"]);
	});

	it("handles environment variables when env is provided", () => {
		expect(parse("$HOME", { HOME: "/root" })).toEqual(["/root"]);
	});

	it("returns empty string for unresolved env variable", () => {
		expect(parse("$HOME")).toEqual([""]);
	});

	it("handles glob patterns", () => {
		expect(parse("*.ts")).toEqual(["*.ts"]);
	});

	it("handles comments", () => {
		expect(parse("foo # bar")).toEqual(["foo"]);
	});

	it("throws for control operators", () => {
		expect(() => parse("a && b")).toThrow(
			'Only simple commands are supported'
		);
	});

	it("handles empty input", () => {
		expect(parse("")).toEqual([]);
	});

	it("handles Windows-style backslash paths", () => {
		expect(parse("C:\\\\foo\\\\bar")).toEqual(["C:\\foo\\bar"]);
	});

	it("handles nested quotes", () => {
		expect(parse('"foo\'bar\'"')).toEqual(["foo'bar'"]);
	});
});

import { describe, it } from "vitest";
import { quote, parse } from "../../utils/shell-quote";

describe("quote", () => {
	it("returns unquoted string for safe arguments", ({ expect }) => {
		expect(quote(["hello"])).toBe("hello");
	});

	it("wraps strings with spaces in quotes", ({ expect }) => {
		expect(quote(["hello world"])).toBe("'hello world'");
	});

	it("escapes special characters", ({ expect }) => {
		expect(quote(["a$b"])).toBe("a\\$b");
	});

	it("handles single quotes by wrapping in double quotes", ({ expect }) => {
		expect(quote(["a'b"])).toBe('"a\'b"');
	});

	it("handles empty array", ({ expect }) => {
		expect(quote([])).toBe("");
	});

	it("handles multiple arguments", ({ expect }) => {
		expect(quote(["a", "b c"])).toBe("a 'b c'");
	});
});

describe("parse", () => {
	it("parses simple arguments", ({ expect }) => {
		expect(parse("foo bar")).toEqual(["foo", "bar"]);
	});

	it("parses single-quoted strings", ({ expect }) => {
		expect(parse("'hello world'")).toEqual(["hello world"]);
	});

	it("parses double-quoted strings", ({ expect }) => {
		expect(parse('"hello world"')).toEqual(["hello world"]);
	});

	it.skipIf(process.platform === "win32")(
		"handles escaped characters",
		({ expect }) => {
			expect(parse("a\\ b")).toEqual(["a b"]);
		}
	);

	it("handles environment variables when env is provided", ({ expect }) => {
		expect(parse("$HOME", { HOME: "/root" })).toEqual(["/root"]);
	});

	it("returns empty string for unresolved env variable", ({ expect }) => {
		expect(parse("$HOME", {})).toEqual([""]);
	});

	it("handles glob patterns", ({ expect }) => {
		expect(parse("*.ts")).toEqual(["*.ts"]);
	});

	it("handles comments", ({ expect }) => {
		expect(parse("foo # bar")).toEqual(["foo"]);
	});

	it("throws for control operators", ({ expect }) => {
		expect(() => parse("a && b")).toThrow("Only simple commands are supported");
	});

	it("handles empty input", ({ expect }) => {
		expect(parse("")).toEqual([]);
	});

	it.skipIf(process.platform === "win32")(
		"handles Windows-style backslash paths",
		({ expect }) => {
			expect(parse(String.raw`C:\\foo\\bar`)).toEqual([String.raw`C:\foo\bar`]);
		}
	);

	it("handles nested quotes", ({ expect }) => {
		expect(parse("\"foo'bar'\"")).toEqual(["foo'bar'"]);
	});
});

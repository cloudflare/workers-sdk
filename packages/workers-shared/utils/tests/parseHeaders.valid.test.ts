// eslint-disable-next-line workers-sdk/no-vitest-import-expect -- see #12346
import { expect, test } from "vitest";
import { parseHeaders } from "../configuration/parseHeaders";

test("parseHeaders should handle a single rule", () => {
	const input = `/a
  Name: Value`;
	const result = parseHeaders(input);
	expect(result).toEqual({
		rules: [{ path: "/a", headers: { name: "Value" }, unsetHeaders: [] }],
		invalid: [],
	});
});

test("parseHeaders should handle headers with exclamation marks", () => {
	const input = `/a
  !Name: Value`;
	const result = parseHeaders(input);
	expect(result).toEqual({
		rules: [{ path: "/a", headers: { "!name": "Value" }, unsetHeaders: [] }],
		invalid: [],
	});
});

test("parseHeaders should ignore blank lines", () => {
	const input = `
/a

Name: Value

`;
	const result = parseHeaders(input);
	expect(result).toEqual({
		rules: [{ path: "/a", headers: { name: "Value" }, unsetHeaders: [] }],
		invalid: [],
	});
});

test("parseHeaders should trim whitespace", () => {
	const input = `
                /a
    Name         :           Value
`;
	const result = parseHeaders(input);
	expect(result).toEqual({
		rules: [{ path: "/a", headers: { name: "Value" }, unsetHeaders: [] }],
		invalid: [],
	});
});

test("parseHeaders should ignore comments", () => {
	const input = `
  # This is a comment
  /a
  # And one here too.
  Name: Value
`;
	const result = parseHeaders(input);
	expect(result).toEqual({
		rules: [{ path: "/a", headers: { name: "Value" }, unsetHeaders: [] }],
		invalid: [],
	});
});

test("parseHeaders should combine headers together", () => {
	const input = `
  /a
    Set-Cookie: test=cookie; expires=never
    Set-Cookie: another=cookie; magic!

  /b
    A: ABBA
    B: BABA
`;
	const result = parseHeaders(input);
	expect(result).toEqual({
		rules: [
			{
				path: "/a",
				headers: {
					"set-cookie": "test=cookie; expires=never, another=cookie; magic!",
				},
				unsetHeaders: [],
			},
			{
				path: "/b",
				headers: { a: "ABBA", b: "BABA" },
				unsetHeaders: [],
			},
		],
		invalid: [],
	});
});

test("parseHeaders should support setting hosts", () => {
	const input = `
  https://example.com
    a: a
  https://example.com/
    b: b
  https://example.com/blog
    c: c
  /blog
    d:d
  https://:subdomain.example.*/path
    e:e
`;
	const result = parseHeaders(input);
	expect(result).toEqual({
		rules: [
			{ path: "https://example.com/", headers: { a: "a" }, unsetHeaders: [] },
			{ path: "https://example.com/", headers: { b: "b" }, unsetHeaders: [] },
			{
				path: "https://example.com/blog",
				headers: { c: "c" },
				unsetHeaders: [],
			},
			{ path: "/blog", headers: { d: "d" }, unsetHeaders: [] },
			{
				path: "https://:subdomain.example.*/path",
				headers: { e: "e" },
				unsetHeaders: [],
			},
		],
		invalid: [],
	});
});

test("parseHeaders should add unset headers", () => {
	const input = `/a
  Name: Value
  ! Place`;
	const result = parseHeaders(input);
	expect(result).toEqual({
		rules: [
			{ path: "/a", headers: { name: "Value" }, unsetHeaders: ["Place"] },
		],
		invalid: [],
	});
});

test("parseHeaders should support custom limits", () => {
	const aaa = Array(1001).fill("a").join("");
	const bbb = Array(1001).fill("b").join("");
	const huge_line = `${aaa}: ${bbb}`;
	let input = `
    # Valid entry
    /a
      Name: Value
    # Jumbo comment line OK, ignored as normal
    ${Array(1001).fill("#").join("")}
    # Huge path names rejected
    /b
      Name: Value
      ${huge_line}
  `;
	let result = parseHeaders(input, { maxLineLength: 3000 });
	expect(result).toEqual({
		rules: [
			{ path: "/a", headers: { name: "Value" }, unsetHeaders: [] },
			{ path: "/b", headers: { name: "Value", [aaa]: bbb }, unsetHeaders: [] },
		],
		invalid: [],
	});

	input = `
    # COMMENTS DON'T COUNT TOWARDS TOTAL VALID RULES
    ${Array(150)
			.fill(undefined)
			.map((_, i) => `/a/${i}\nx-index: ${i}`)
			.join("\n")}
    # BUT DO GET COUNTED AS TOTAL LINES SKIPPED
  `;
	result = parseHeaders(input, { maxRules: 200 });
	expect(result.rules.length).toBe(150);
	expect(result.invalid.length).toBe(0);
});

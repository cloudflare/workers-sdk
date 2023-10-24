import { test, expect } from "vitest";
import { parseRedirects } from "../../metadata-generator/parseRedirects";

test("parseRedirects should handle a single rule", () => {
	const input = `/a /b 301`;
	const result = parseRedirects(input);
	expect(result).toEqual({
		rules: [{ from: "/a", status: 301, to: "/b", lineNumber: 1 }],
		invalid: [],
	});
});

test("parseRedirects should ignore blank lines", () => {
	const input = `
/a /b 301
`;
	const result = parseRedirects(input);
	expect(result).toEqual({
		rules: [{ from: "/a", status: 301, to: "/b", lineNumber: 2 }],
		invalid: [],
	});
});

test("parseRedirects should trim whitespace", () => {
	const input = `
  /a /b 301
`;
	const result = parseRedirects(input);
	expect(result).toEqual({
		rules: [{ from: "/a", status: 301, to: "/b", lineNumber: 2 }],
		invalid: [],
	});
});

test("parseRedirects should ignore comments", () => {
	const input = `
  # This is a comment
  /a /b 301
  # And one here too.
`;
	const result = parseRedirects(input);
	expect(result).toEqual({
		rules: [{ from: "/a", status: 301, to: "/b", lineNumber: 3 }],
		invalid: [],
	});
});

test("parseRedirects should default to 302", () => {
	const input = `
  /a /b 302
  /c /d
`;
	const result = parseRedirects(input);
	expect(result).toEqual({
		rules: [
			{ from: "/a", status: 302, to: "/b", lineNumber: 2 },
			{ from: "/c", status: 302, to: "/d", lineNumber: 3 },
		],
		invalid: [],
	});
});

test("parseRedirects should preserve querystrings on to", () => {
	const input = `
  /a /b?query=string 302
  /c?this=rejected /d 301
  /ext https://some.domain:1234/route?q=string#anchor
`;
	const result = parseRedirects(input);
	expect(result).toEqual({
		rules: [
			{ from: "/a", status: 302, to: "/b?query=string", lineNumber: 2 },
			{ from: "/c", status: 301, to: "/d", lineNumber: 3 },
			{
				from: "/ext",
				status: 302,
				to: "https://some.domain:1234/route?q=string#anchor",
				lineNumber: 4,
			},
		],
		invalid: [],
	});
});

test("parseRedirects should preserve fragments", () => {
	const input = `
  /a /b#blah 302
`;
	const result = parseRedirects(input);
	expect(result).toEqual({
		rules: [{ from: "/a", status: 302, to: "/b#blah", lineNumber: 2 }],
		invalid: [],
	});
});

test("parseRedirects should preserve fragments which contain a hash sign", () => {
	const input = `
  /a /b##blah-1 302
`;
	const result = parseRedirects(input);
	expect(result).toEqual({
		rules: [{ from: "/a", status: 302, to: "/b##blah-1", lineNumber: 2 }],
		invalid: [],
	});
});

test("parseRedirects should preserve fragments which contain a hash sign and are full URLs", () => {
	const input = `
  /a https://example.com/b##blah-1 302
`;
	const result = parseRedirects(input);
	expect(result).toEqual({
		rules: [
			{
				from: "/a",
				status: 302,
				to: "https://example.com/b##blah-1",
				lineNumber: 2,
			},
		],
		invalid: [],
	});
});

test("parseRedirects should accept 200 (proxying) redirects", () => {
	const input = `
	/a /b 200
`;
	const result = parseRedirects(input);
	expect(result).toEqual({
		rules: [
			{
				from: "/a",
				status: 200,
				to: "/b",
				lineNumber: 2,
			},
		],
		invalid: [],
	});
});

test("parseRedirects should accept absolute URLs that end with index.html", () => {
	const input = `
	/foo https://bar.com/index.html 302
`;
	const result = parseRedirects(input);
	expect(result).toEqual({
		rules: [
			{
				from: "/foo",
				status: 302,
				to: "https://bar.com/index.html",
				lineNumber: 2,
			},
		],
		invalid: [],
	});
});

test("parseRedirects should accept going to absolute URLs with ports", () => {
	const input = `
	/foo https://bar.com:123/index.html 302
	/cat https://cat.com:12345 302
	/dog https://dog.com:12345
	`;
	const result = parseRedirects(input);
	expect(result).toEqual({
		rules: [
			{
				from: "/foo",
				status: 302,
				to: "https://bar.com:123/index.html",
				lineNumber: 2,
			},
			{
				from: "/cat",
				status: 302,
				to: "https://cat.com:12345/",
				lineNumber: 3,
			},
			{
				from: "/dog",
				status: 302,
				to: "https://dog.com:12345/",
				lineNumber: 4,
			},
		],
		invalid: [],
	});
});

test("parseRedirects should accept relative URLs that don't point to .html files", () => {
	const input = `
	/* /foo 200
`;
	const result = parseRedirects(input);
	expect(result).toEqual({
		rules: [
			{
				from: "/*",
				status: 200,
				to: "/foo",
				lineNumber: 2,
			},
		],
		invalid: [],
	});
});

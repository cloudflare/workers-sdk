// Snapshot values
const maxDynamicRedirectRules = 100;
const maxLineLength = 2000;
const maxStaticRedirectRules = 2000;

import { parseRedirects } from "../..//metadata-generator/parseRedirects";

test("parseRedirects should reject malformed lines", () => {
	const input = `
    # Single token
    /c
    # Four tokens
    /d /e 302 !important
  `;
	const result = parseRedirects(input);
	expect(result).toEqual({
		rules: [],
		invalid: [
			{
				line: `/c`,
				lineNumber: 3,
				message: "Expected exactly 2 or 3 whitespace-separated tokens. Got 1.",
			},
			{
				line: `/d /e 302 !important`,
				lineNumber: 5,
				message: "Expected exactly 2 or 3 whitespace-separated tokens. Got 4.",
			},
		],
	});
});

test("parseRedirects should reject invalid status codes", () => {
	const input = `
    # Valid token sails through
    /a /b 301
    # 200 NOT OK
    /c /d 200
  `;
	const result = parseRedirects(input);
	expect(result).toEqual({
		rules: [{ from: "/a", status: 301, to: "/b", lineNumber: 3 }],
		invalid: [
			{
				line: `/c /d 200`,
				lineNumber: 5,
				message:
					"Valid status codes are 301, 302 (default), 303, 307, or 308. Got 200.",
			},
		],
	});
});

test(`parseRedirects should reject duplicate 'from' paths`, () => {
	const input = `
    # Valid entry
    /a /b
    # Nonsensical but permitted (for now)
    /b /a
    # Duplicate 'from'
    /a /c
  `;
	const result = parseRedirects(input);
	expect(result).toEqual({
		rules: [
			{ from: "/a", status: 302, to: "/b", lineNumber: 3 },
			{ from: "/b", status: 302, to: "/a", lineNumber: 5 },
		],
		invalid: [
			{
				line: `/a /c`,
				lineNumber: 7,
				message: `Ignoring duplicate rule for path /a.`,
			},
		],
	});
});

test(`parseRedirects should reject lines longer than ${maxLineLength} chars`, () => {
	const huge_line = `/${Array(maxLineLength).fill("a").join("")} /${Array(
		maxLineLength
	)
		.fill("b")
		.join("")} 301`;
	const input = `
    # Valid entry
    /a /b
    # Jumbo comment line OK, ignored as normal
    ${Array(maxLineLength + 1)
			.fill("#")
			.join("")}
    # Huge path names rejected
    ${huge_line}
  `;
	const result = parseRedirects(input);
	expect(result).toEqual({
		rules: [{ from: "/a", status: 302, to: "/b", lineNumber: 3 }],
		invalid: [
			{
				message: `Ignoring line 7 as it exceeds the maximum allowed length of ${maxLineLength}.`,
			},
		],
	});
});

test("parseRedirects should reject any dynamic rules after the first 100", () => {
	const input = `
    # COMMENTS DON'T COUNT TOWARDS TOTAL VALID RULES
    ${Array(150)
			.fill(undefined)
			.map((_, i) => `/a/${i}/* /b/${i}/:splat`)
			.join("\n")}
    # BUT DO GET COUNTED AS TOTAL LINES SKIPPED
  `;

	expect(parseRedirects(input)).toEqual({
		rules: Array(100)
			.fill(undefined)
			.map((_, i) => ({
				from: `/a/${i}/*`,
				to: `/b/${i}/:splat`,
				status: 302,
				lineNumber: i + 3,
			})),
		invalid: [
			{
				message: `Maximum number of dynamic rules supported is 100. Skipping remaining 52 lines of file.`,
			},
		],
	});
});

test(`parseRedirects should reject any static rules after the first ${maxStaticRedirectRules}`, () => {
	const input = `
    # COMMENTS DON'T COUNT TOWARDS TOTAL VALID RULES
    ${Array(maxStaticRedirectRules + 50)
			.fill(undefined)
			.map((_, i) => `/a/${i} /b/${i}`)
			.join("\n")}
    # BUT DO GET COUNTED AS TOTAL LINES SKIPPED
  `;

	expect(parseRedirects(input)).toEqual({
		rules: Array(maxStaticRedirectRules)
			.fill(undefined)
			.map((_, i) => ({
				from: `/a/${i}`,
				to: `/b/${i}`,
				status: 302,
				lineNumber: i + 3,
			})),
		invalid: Array(50)
			.fill(undefined)
			.map(() => ({
				message: `Maximum number of static rules supported is ${maxStaticRedirectRules}. Skipping line.`,
			})),
	});
});

test("parseRedirects should reject a combination of lots of static and dynamic rules", () => {
	const input = `
    # COMMENTS DON'T COUNT TOWARDS TOTAL VALID RULES
    ${Array(maxStaticRedirectRules + 50)
			.fill(undefined)
			.map((_, i) => `/a/${i} /b/${i}`)
			.join("\n")}
      ${Array(maxDynamicRedirectRules + 50)
				.fill(undefined)
				.map((_, i) => `/a/${i}/* /b/${i}/:splat`)
				.join("\n")}
    # BUT DO GET COUNTED AS TOTAL LINES SKIPPED
  `;

	expect(parseRedirects(input)).toEqual({
		rules: [
			...Array(maxStaticRedirectRules)
				.fill(undefined)
				.map((_, i) => ({
					from: `/a/${i}`,
					to: `/b/${i}`,
					status: 302,
					lineNumber: i + 3,
				})),
			...Array(maxDynamicRedirectRules)
				.fill(undefined)
				.map((_, i) => ({
					from: `/a/${i}/*`,
					to: `/b/${i}/:splat`,
					status: 302,
					lineNumber: i + maxStaticRedirectRules + 53,
				})),
		],
		invalid: [
			...Array(50)
				.fill(undefined)
				.map(() => ({
					message: `Maximum number of static rules supported is ${maxStaticRedirectRules}. Skipping line.`,
				})),
			{
				message: `Maximum number of dynamic rules supported is ${maxDynamicRedirectRules}. Skipping remaining 52 lines of file.`,
			},
		],
	});
});

test("parseRedirects should reject malformed URLs", () => {
	const input = `
  # Spaces rejected on token length
  /some page /somewhere else
  # OK with URL escaped encoding
  /some%20page /somewhere%20else
  # Unescaped URLs are handled OK by Deno, so escape & pass them through
  /://so;\`me /nons:/&@%+~{}ense
  # Absolute URLs aren't OK for 'from', but are fine for 'to'
  https://yeah.com https://nah.com
  /nah https://yeah.com
  # This is actually parsed as /yeah.com, which we might want to detect but is ok for now
  yeah.com https://nah.com
`;
	const result = parseRedirects(input);
	expect(result).toEqual({
		invalid: [
			{
				line: `/some page /somewhere else`,
				lineNumber: 3,
				message: "Expected exactly 2 or 3 whitespace-separated tokens. Got 4.",
			},
			{
				line: `https://yeah.com https://nah.com`,
				lineNumber: 9,
				message:
					"Only relative URLs are allowed. Skipping absolute URL https://yeah.com.",
			},
		],
		rules: [
			{
				from: "/some%20page",
				status: 302,
				to: "/somewhere%20else",
				lineNumber: 5,
			},
			{
				from: "/://so;%60me",
				status: 302,
				to: "/nons:/&@%+~%7B%7Dense",
				lineNumber: 7,
			},
			{ from: "/nah", status: 302, to: "https://yeah.com/", lineNumber: 10 },
			{
				from: "/yeah.com",
				status: 302,
				to: "https://nah.com/",
				lineNumber: 12,
			},
		],
	});
});

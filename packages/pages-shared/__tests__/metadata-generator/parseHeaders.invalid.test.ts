import { parseHeaders } from "../..//metadata-generator/parseHeaders";

test("parseHeaders should reject malformed initial lines", () => {
	const input = `
    # A single token before a path
    c
    # A header before a path
    Access-Control-Allow-Origin: *
  `;
	const result = parseHeaders(input);
	expect(result).toEqual({
		rules: [],
		invalid: [
			{
				line: "c",
				lineNumber: 3,
				message: "Expected a path beginning with at least one forward-slash",
			},
			{
				line: "Access-Control-Allow-Origin: *",
				lineNumber: 5,
				message:
					"Path should come before header (access-control-allow-origin: *)",
			},
		],
	});
});

test("parseHeaders should reject invalid headers", () => {
	const input = `
    # Valid header sails through
    /a
      Name:       Value
    #
    /b
      I'm invalid!
      !x-content-type
      But: I'm okay!
      ! Content-Type: application/json
  `;
	const result = parseHeaders(input);
	expect(result).toEqual({
		rules: [
			{ path: "/a", headers: { name: "Value" }, unsetHeaders: [] },
			{ path: "/b", headers: { but: "I'm okay!" }, unsetHeaders: [] },
		],
		invalid: [
			{
				line: `I'm invalid!`,
				lineNumber: 7,
				message: "Expected a colon-separated header pair (e.g. name: value)",
			},
			{
				line: "!x-content-type",
				lineNumber: 8,
				message: "Expected a colon-separated header pair (e.g. name: value)",
			},
			{
				line: `! Content-Type: application/json`,
				lineNumber: 10,
				message: "Header name cannot include spaces",
			},
		],
	});
});

test("parseHeaders should reject lines longer than 2000 chars", () => {
	const huge_line = `${Array(1001).fill("a").join("")}: ${Array(1001)
		.fill("b")
		.join("")}`;
	const input = `
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
	const result = parseHeaders(input);
	expect(result).toEqual({
		rules: [
			{ path: "/a", headers: { name: "Value" }, unsetHeaders: [] },
			{ path: "/b", headers: { name: "Value" }, unsetHeaders: [] },
		],
		invalid: [
			{
				message: `Ignoring line 10 as it exceeds the maximum allowed length of 2000.`,
			},
		],
	});
});

test("parseHeaders should reject any rules after the first 100", () => {
	const input = `
    # COMMENTS DON'T COUNT TOWARDS TOTAL VALID RULES
    ${Array(150)
			.fill(undefined)
			.map((_, i) => `/a/${i}\nx-index: ${i}`)
			.join("\n")}
    # BUT DO GET COUNTED AS TOTAL LINES SKIPPED
  `;

	expect(parseHeaders(input)).toEqual({
		rules: Array(101)
			.fill(undefined)
			.map((_, i) => ({
				path: "/a/" + i,
				headers: { "x-index": `${i}` },
				unsetHeaders: [],
			})),
		invalid: [
			{
				message: `Maximum number of rules supported is 100. Skipping remaining 100 lines of file.`,
			},
		],
	});
});

test("parseHeaders should reject malformed URLs", () => {
	const input = `
  # Spaces should be URI encoded
  /some page with spaces
    valid: yup
  # OK with URL escaped encoding
  /some%20page
    valid: yup
  # Unescaped URLs are handled OK by Deno, so escape & pass them through
  /://so;\`me
    valid: yup
  /nons:/&@%+~{}ense
    valid: yup
  # Absolute URLs with a non-https protocol should be rejected
  https://yeah.com
    valid: yup
  http://nah.com/blog
    invalid: things
  //yeah.com/blog
    valid: things
  /yeah
    valid: yup
  /yeah.com
    valid: yup
  # Anything standalone is interpreted as a invalid header pair
  nah.com
  :
  test:
`;
	const result = parseHeaders(input);
	expect(result).toEqual({
		invalid: [
			{
				line: "http://nah.com/blog",
				lineNumber: 16,
				message:
					'URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").',
			},
			{
				line: "invalid: things",
				lineNumber: 17,
				message: "Path should come before header (invalid: things)",
			},
			{
				line: "nah.com",
				lineNumber: 25,
				message: "Expected a colon-separated header pair (e.g. name: value)",
			},
			{ line: ":", lineNumber: 26, message: "No header name specified" },
			{ line: "test:", lineNumber: 27, message: "No header value specified" },
		],
		rules: [
			{
				path: "/some%20page%20with%20spaces",
				headers: { valid: "yup" },
				unsetHeaders: [],
			},
			{ path: "/some%20page", headers: { valid: "yup" }, unsetHeaders: [] },
			{ path: "/://so;%60me", headers: { valid: "yup" }, unsetHeaders: [] },
			{
				path: "/nons:/&@%+~%7B%7Dense",
				headers: { valid: "yup" },
				unsetHeaders: [],
			},
			{
				path: "https://yeah.com/",
				headers: { valid: "yup" },
				unsetHeaders: [],
			},
			{
				path: "//yeah.com/blog",
				headers: { valid: "things" },
				unsetHeaders: [],
			},
			{ path: "/yeah", headers: { valid: "yup" }, unsetHeaders: [] },
			{ path: "/yeah.com", headers: { valid: "yup" }, unsetHeaders: [] },
		],
	});
});

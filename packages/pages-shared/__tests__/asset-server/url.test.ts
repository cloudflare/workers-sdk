import { stringifyURLToRootRelativePathname } from "../../asset-server/url";

describe("URL Utils", () => {
	test("stringifyURLToRootRelativePathname", () => {
		[
			["https://example.com", "/"],
			["https://example.com/foo/", "/foo/"],
			["https://example.com/bar?baz=1", "/bar?baz=1"],
			["https://example.com/foo#withhash", "/foo#withhash"],
			[
				"https://example.com/foo?search=and#withhash",
				"/foo?search=and#withhash",
			],
		].forEach(([inputUrl, expected]) => {
			expect(stringifyURLToRootRelativePathname(new URL(inputUrl))).toBe(
				expected
			);
		});
	});
});

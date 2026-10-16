import { describe, it } from "vitest";
import { toUrlPath } from "../src/url-path";

describe("toUrlPath", () => {
	it.for(["C:\\project\\file.js", "c:/project/file.js", "D:file.js"])(
		"rejects a Windows drive prefix in %s",
		(filePath, { expect }) => {
			expect(() => toUrlPath(filePath)).toThrow(
				"Tried to convert a Windows file path with a drive to a URL path."
			);
		}
	);

	it.for([
		["foo\\bar.js", "foo/bar.js"],
		["/foo/bar.js", "/foo/bar.js"],
		["./foo/bar.js", "./foo/bar.js"],
		["", ""],
	])("normalizes %s", ([filePath, expected], { expect }) => {
		expect(toUrlPath(filePath)).toBe(expected);
	});
});

import { describe, expect, test } from "vitest";
import { stripLeadingDoubleSlashes } from "../../asset-server/responses";

describe("stripLeadingDoubleSlashes", () => {
	test("strips extra leading `/`, `%2F`, `%2f`s, spaces, and tabs", () => {
		expect(stripLeadingDoubleSlashes("/")).toMatchInlineSnapshot(`"/"`);
		expect(stripLeadingDoubleSlashes("/%2Ffoo")).toMatchInlineSnapshot(
			`"/foo"`
		);
		expect(stripLeadingDoubleSlashes("/%2ffoo")).toMatchInlineSnapshot(
			`"/foo"`
		);
		expect(stripLeadingDoubleSlashes("/%2F%2f/foo")).toMatchInlineSnapshot(
			`"/foo"`
		);
		expect(stripLeadingDoubleSlashes("/%5Cfoo")).toMatchInlineSnapshot(
			`"/foo"`
		);
		expect(stripLeadingDoubleSlashes("/%5cfoo")).toMatchInlineSnapshot(
			`"/foo"`
		);
		expect(stripLeadingDoubleSlashes("/%5C%5c/foo")).toMatchInlineSnapshot(
			`"/foo"`
		);
		expect(stripLeadingDoubleSlashes("/%2f%5c/foo")).toMatchInlineSnapshot(
			`"/foo"`
		);
		expect(stripLeadingDoubleSlashes("/\\/foo")).toMatchInlineSnapshot(
			`"/foo"`
		);
		expect(stripLeadingDoubleSlashes("%2ffoo")).toMatchInlineSnapshot(`"/foo"`);
		expect(stripLeadingDoubleSlashes("/foo/%2f")).toMatchInlineSnapshot(
			`"/foo/%2f"`
		);
		expect(stripLeadingDoubleSlashes("/foo/%2F")).toMatchInlineSnapshot(
			`"/foo/%2F"`
		);
		expect(stripLeadingDoubleSlashes("/foo//")).toMatchInlineSnapshot(
			`"/foo//"`
		);
		expect(stripLeadingDoubleSlashes("/foo//bar")).toMatchInlineSnapshot(
			`"/foo//bar"`
		);
		expect(stripLeadingDoubleSlashes("/foo/\\/bar")).toMatchInlineSnapshot(
			`"/foo/\\\\/bar"`
		);
		expect(stripLeadingDoubleSlashes("/%09foo")).toMatchInlineSnapshot(
			`"/foo"`
		);
		expect(stripLeadingDoubleSlashes("/%09/foo")).toMatchInlineSnapshot(
			`"/foo"`
		);
		// Unencoded space / tab
		expect(stripLeadingDoubleSlashes("/%09/foo/%09/ /	/")).toMatchInlineSnapshot(
			`"/foo/%09/ /	/"`
		);
		// Unencoded space
		expect(stripLeadingDoubleSlashes("/ /foo")).toMatchInlineSnapshot(`"/foo"`);
		// Unencoded tab
		expect(stripLeadingDoubleSlashes("/	/foo")).toMatchInlineSnapshot(`"/foo"`);
	});
});

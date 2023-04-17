import { stripLeadingDoubleSlashes } from "../../asset-server/responses";

describe("stripLeadingDoubleSlashes", () => {
	it("strips extra leading `/`, `%2F` and `%2f`s", () => {
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
	});
});

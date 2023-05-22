"use strict";
exports.__esModule = true;
var responses_1 = require("../../asset-server/responses");
describe("stripLeadingDoubleSlashes", function () {
    it("strips extra leading `/`, `%2F`, `%2f`s, spaces, and tabs", function () {
        expect((0, responses_1.stripLeadingDoubleSlashes)("/")).toMatchInlineSnapshot("\"/\"");
        expect((0, responses_1.stripLeadingDoubleSlashes)("/%2Ffoo")).toMatchInlineSnapshot("\"/foo\"");
        expect((0, responses_1.stripLeadingDoubleSlashes)("/%2ffoo")).toMatchInlineSnapshot("\"/foo\"");
        expect((0, responses_1.stripLeadingDoubleSlashes)("/%2F%2f/foo")).toMatchInlineSnapshot("\"/foo\"");
        expect((0, responses_1.stripLeadingDoubleSlashes)("/%5Cfoo")).toMatchInlineSnapshot("\"/foo\"");
        expect((0, responses_1.stripLeadingDoubleSlashes)("/%5cfoo")).toMatchInlineSnapshot("\"/foo\"");
        expect((0, responses_1.stripLeadingDoubleSlashes)("/%5C%5c/foo")).toMatchInlineSnapshot("\"/foo\"");
        expect((0, responses_1.stripLeadingDoubleSlashes)("/%2f%5c/foo")).toMatchInlineSnapshot("\"/foo\"");
        expect((0, responses_1.stripLeadingDoubleSlashes)("/\\/foo")).toMatchInlineSnapshot("\"/foo\"");
        expect((0, responses_1.stripLeadingDoubleSlashes)("%2ffoo")).toMatchInlineSnapshot("\"/foo\"");
        expect((0, responses_1.stripLeadingDoubleSlashes)("/foo/%2f")).toMatchInlineSnapshot("\"/foo/%2f\"");
        expect((0, responses_1.stripLeadingDoubleSlashes)("/foo/%2F")).toMatchInlineSnapshot("\"/foo/%2F\"");
        expect((0, responses_1.stripLeadingDoubleSlashes)("/foo//")).toMatchInlineSnapshot("\"/foo//\"");
        expect((0, responses_1.stripLeadingDoubleSlashes)("/foo//bar")).toMatchInlineSnapshot("\"/foo//bar\"");
        expect((0, responses_1.stripLeadingDoubleSlashes)("/foo/\\/bar")).toMatchInlineSnapshot("\"/foo/\\\\/bar\"");
        expect((0, responses_1.stripLeadingDoubleSlashes)("/%09foo")).toMatchInlineSnapshot("\"/foo\"");
        expect((0, responses_1.stripLeadingDoubleSlashes)("/%09/foo")).toMatchInlineSnapshot("\"/foo\"");
        // Unencoded space / tab
        expect((0, responses_1.stripLeadingDoubleSlashes)("/%09/foo/%09/ /	/")).toMatchInlineSnapshot("\"/foo/%09/ /\t/\"");
        // Unencoded space
        expect((0, responses_1.stripLeadingDoubleSlashes)("/ /foo")).toMatchInlineSnapshot("\"/foo\"");
        // Unencoded tab
        expect((0, responses_1.stripLeadingDoubleSlashes)("/	/foo")).toMatchInlineSnapshot("\"/foo\"");
    });
});

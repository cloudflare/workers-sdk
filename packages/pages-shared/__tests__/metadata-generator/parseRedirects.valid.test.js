"use strict";
exports.__esModule = true;
var parseRedirects_1 = require("../../metadata-generator/parseRedirects");
test("parseRedirects should handle a single rule", function () {
    var input = "/a /b 301";
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        rules: [{ from: "/a", status: 301, to: "/b", lineNumber: 1 }],
        invalid: []
    });
});
test("parseRedirects should ignore blank lines", function () {
    var input = "\n/a /b 301\n";
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        rules: [{ from: "/a", status: 301, to: "/b", lineNumber: 2 }],
        invalid: []
    });
});
test("parseRedirects should trim whitespace", function () {
    var input = "\n  /a /b 301\n";
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        rules: [{ from: "/a", status: 301, to: "/b", lineNumber: 2 }],
        invalid: []
    });
});
test("parseRedirects should ignore comments", function () {
    var input = "\n  # This is a comment\n  /a /b 301\n  # And one here too.\n";
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        rules: [{ from: "/a", status: 301, to: "/b", lineNumber: 3 }],
        invalid: []
    });
});
test("parseRedirects should default to 302", function () {
    var input = "\n  /a /b 302\n  /c /d\n";
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        rules: [
            { from: "/a", status: 302, to: "/b", lineNumber: 2 },
            { from: "/c", status: 302, to: "/d", lineNumber: 3 },
        ],
        invalid: []
    });
});
test("parseRedirects should preserve querystrings on to", function () {
    var input = "\n  /a /b?query=string 302\n  /c?this=rejected /d 301\n  /ext https://some.domain:1234/route?q=string#anchor\n";
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        rules: [
            { from: "/a", status: 302, to: "/b?query=string", lineNumber: 2 },
            { from: "/c", status: 301, to: "/d", lineNumber: 3 },
            {
                from: "/ext",
                status: 302,
                to: "https://some.domain:1234/route?q=string#anchor",
                lineNumber: 4
            },
        ],
        invalid: []
    });
});
test("parseRedirects should preserve fragments", function () {
    var input = "\n  /a /b#blah 302\n";
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        rules: [{ from: "/a", status: 302, to: "/b#blah", lineNumber: 2 }],
        invalid: []
    });
});
test("parseRedirects should preserve fragments which contain a hash sign", function () {
    var input = "\n  /a /b##blah-1 302\n";
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        rules: [{ from: "/a", status: 302, to: "/b##blah-1", lineNumber: 2 }],
        invalid: []
    });
});
test("parseRedirects should preserve fragments which contain a hash sign and are full URLs", function () {
    var input = "\n  /a https://example.com/b##blah-1 302\n";
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        rules: [
            {
                from: "/a",
                status: 302,
                to: "https://example.com/b##blah-1",
                lineNumber: 2
            },
        ],
        invalid: []
    });
});
test("parseRedirects should accept 200 (proxying) redirects", function () {
    var input = "\n\t/a /b 200\n";
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        rules: [
            {
                from: "/a",
                status: 200,
                to: "/b",
                lineNumber: 2
            },
        ],
        invalid: []
    });
});
test("parseRedirects should accept absolute URLs that end with index.html", function () {
    var input = "\n\t/foo https://bar.com/index.html 302\n";
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        rules: [
            {
                from: "/foo",
                status: 302,
                to: "https://bar.com/index.html",
                lineNumber: 2
            },
        ],
        invalid: []
    });
});
test("parseRedirects should accept relative URLs that don't point to .html files", function () {
    var input = "\n\t/* /foo 200\n";
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        rules: [
            {
                from: "/*",
                status: 200,
                to: "/foo",
                lineNumber: 2
            },
        ],
        invalid: []
    });
});

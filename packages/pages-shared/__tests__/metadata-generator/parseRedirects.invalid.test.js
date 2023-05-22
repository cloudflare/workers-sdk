"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
exports.__esModule = true;
// Snapshot values
var maxDynamicRedirectRules = 100;
var maxLineLength = 2000;
var maxStaticRedirectRules = 2000;
var parseRedirects_1 = require("../..//metadata-generator/parseRedirects");
test("parseRedirects should reject malformed lines", function () {
    var input = "\n    # Single token\n    /c\n    # Four tokens\n    /d /e 302 !important\n  ";
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        rules: [],
        invalid: [
            {
                line: "/c",
                lineNumber: 3,
                message: "Expected exactly 2 or 3 whitespace-separated tokens. Got 1."
            },
            {
                line: "/d /e 302 !important",
                lineNumber: 5,
                message: "Expected exactly 2 or 3 whitespace-separated tokens. Got 4."
            },
        ]
    });
});
test("parseRedirects should reject invalid status codes", function () {
    var input = "\n    # Valid token sails through\n    /a /b 301\n    # 418 NOT OK\n    /c /d 418\n  ";
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        rules: [{ from: "/a", status: 301, to: "/b", lineNumber: 3 }],
        invalid: [
            {
                line: "/c /d 418",
                lineNumber: 5,
                message: "Valid status codes are 200, 301, 302 (default), 303, 307, or 308. Got 418."
            },
        ]
    });
});
test("parseRedirects should reject duplicate 'from' paths", function () {
    var input = "\n    # Valid entry\n    /a /b\n    # Nonsensical but permitted (for now)\n    /b /a\n    # Duplicate 'from'\n    /a /c\n  ";
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        rules: [
            { from: "/a", status: 302, to: "/b", lineNumber: 3 },
            { from: "/b", status: 302, to: "/a", lineNumber: 5 },
        ],
        invalid: [
            {
                line: "/a /c",
                lineNumber: 7,
                message: "Ignoring duplicate rule for path /a."
            },
        ]
    });
});
test("parseRedirects should reject lines longer than ".concat(maxLineLength, " chars"), function () {
    var huge_line = "/".concat(Array(maxLineLength).fill("a").join(""), " /").concat(Array(maxLineLength)
        .fill("b")
        .join(""), " 301");
    var input = "\n    # Valid entry\n    /a /b\n    # Jumbo comment line OK, ignored as normal\n    ".concat(Array(maxLineLength + 1)
        .fill("#")
        .join(""), "\n    # Huge path names rejected\n    ").concat(huge_line, "\n  ");
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        rules: [{ from: "/a", status: 302, to: "/b", lineNumber: 3 }],
        invalid: [
            {
                message: "Ignoring line 7 as it exceeds the maximum allowed length of ".concat(maxLineLength, ".")
            },
        ]
    });
});
test("parseRedirects should reject any dynamic rules after the first 100", function () {
    var input = "\n    # COMMENTS DON'T COUNT TOWARDS TOTAL VALID RULES\n    ".concat(Array(150)
        .fill(undefined)
        .map(function (_, i) { return "/a/".concat(i, "/* /b/").concat(i, "/:splat"); })
        .join("\n"), "\n    # BUT DO GET COUNTED AS TOTAL LINES SKIPPED\n  ");
    expect((0, parseRedirects_1.parseRedirects)(input)).toEqual({
        rules: Array(100)
            .fill(undefined)
            .map(function (_, i) { return ({
            from: "/a/".concat(i, "/*"),
            to: "/b/".concat(i, "/:splat"),
            status: 302,
            lineNumber: i + 3
        }); }),
        invalid: [
            {
                message: "Maximum number of dynamic rules supported is 100. Skipping remaining 52 lines of file."
            },
        ]
    });
});
test("parseRedirects should reject any static rules after the first ".concat(maxStaticRedirectRules), function () {
    var input = "\n    # COMMENTS DON'T COUNT TOWARDS TOTAL VALID RULES\n    ".concat(Array(maxStaticRedirectRules + 50)
        .fill(undefined)
        .map(function (_, i) { return "/a/".concat(i, " /b/").concat(i); })
        .join("\n"), "\n    # BUT DO GET COUNTED AS TOTAL LINES SKIPPED\n  ");
    expect((0, parseRedirects_1.parseRedirects)(input)).toEqual({
        rules: Array(maxStaticRedirectRules)
            .fill(undefined)
            .map(function (_, i) { return ({
            from: "/a/".concat(i),
            to: "/b/".concat(i),
            status: 302,
            lineNumber: i + 3
        }); }),
        invalid: Array(50)
            .fill(undefined)
            .map(function () { return ({
            message: "Maximum number of static rules supported is ".concat(maxStaticRedirectRules, ". Skipping line.")
        }); })
    });
});
test("parseRedirects should reject a combination of lots of static and dynamic rules", function () {
    var input = "\n    # COMMENTS DON'T COUNT TOWARDS TOTAL VALID RULES\n    ".concat(Array(maxStaticRedirectRules + 50)
        .fill(undefined)
        .map(function (_, i) { return "/a/".concat(i, " /b/").concat(i); })
        .join("\n"), "\n      ").concat(Array(maxDynamicRedirectRules + 50)
        .fill(undefined)
        .map(function (_, i) { return "/a/".concat(i, "/* /b/").concat(i, "/:splat"); })
        .join("\n"), "\n    # BUT DO GET COUNTED AS TOTAL LINES SKIPPED\n  ");
    expect((0, parseRedirects_1.parseRedirects)(input)).toEqual({
        rules: __spreadArray(__spreadArray([], Array(maxStaticRedirectRules)
            .fill(undefined)
            .map(function (_, i) { return ({
            from: "/a/".concat(i),
            to: "/b/".concat(i),
            status: 302,
            lineNumber: i + 3
        }); }), true), Array(maxDynamicRedirectRules)
            .fill(undefined)
            .map(function (_, i) { return ({
            from: "/a/".concat(i, "/*"),
            to: "/b/".concat(i, "/:splat"),
            status: 302,
            lineNumber: i + maxStaticRedirectRules + 53
        }); }), true),
        invalid: __spreadArray(__spreadArray([], Array(50)
            .fill(undefined)
            .map(function () { return ({
            message: "Maximum number of static rules supported is ".concat(maxStaticRedirectRules, ". Skipping line.")
        }); }), true), [
            {
                message: "Maximum number of dynamic rules supported is ".concat(maxDynamicRedirectRules, ". Skipping remaining 52 lines of file.")
            },
        ], false)
    });
});
test("parseRedirects should reject malformed URLs", function () {
    var input = "\n  # Spaces rejected on token length\n  /some page /somewhere else\n  # OK with URL escaped encoding\n  /some%20page /somewhere%20else\n  # Unescaped URLs are handled OK by Deno, so escape & pass them through\n  /://so;`me /nons:/&@%+~{}ense\n  # Absolute URLs aren't OK for 'from', but are fine for 'to'\n  https://yeah.com https://nah.com\n  /nah https://yeah.com\n  # This is actually parsed as /yeah.com, which we might want to detect but is ok for now\n  yeah.com https://nah.com\n";
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        invalid: [
            {
                line: "/some page /somewhere else",
                lineNumber: 3,
                message: "Expected exactly 2 or 3 whitespace-separated tokens. Got 4."
            },
            {
                line: "https://yeah.com https://nah.com",
                lineNumber: 9,
                message: "Only relative URLs are allowed. Skipping absolute URL https://yeah.com."
            },
        ],
        rules: [
            {
                from: "/some%20page",
                status: 302,
                to: "/somewhere%20else",
                lineNumber: 5
            },
            {
                from: "/://so;%60me",
                status: 302,
                to: "/nons:/&@%+~%7B%7Dense",
                lineNumber: 7
            },
            { from: "/nah", status: 302, to: "https://yeah.com/", lineNumber: 10 },
            {
                from: "/yeah.com",
                status: 302,
                to: "https://nah.com/",
                lineNumber: 12
            },
        ]
    });
});
test("parseRedirects should reject non-relative URLs for proxying (200) redirects", function () {
    var input = "\n\t/a https://example.com/b 200\n";
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        rules: [],
        invalid: [
            {
                line: "/a https://example.com/b 200",
                lineNumber: 2,
                message: "Proxy (200) redirects can only point to relative paths. Got https://example.com/b"
            },
        ]
    });
});
test("parseRedirects should reject '/* /index.html'", function () {
    var input = "\n/* /index.html 200\n/* /index 200\n/ /index.html\n/ /index\n/* /foo/index.html\n\n/* /foo\n/foo/* /bar 200\n/ /foo\n";
    var invalidRedirectError = "Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again. Please fix or remove this rule to silence this warning.";
    var result = (0, parseRedirects_1.parseRedirects)(input);
    expect(result).toEqual({
        rules: [
            {
                from: "/*",
                status: 302,
                to: "/foo",
                lineNumber: 8
            },
            {
                from: "/foo/*",
                status: 200,
                to: "/bar",
                lineNumber: 9
            },
            {
                from: "/",
                status: 302,
                to: "/foo",
                lineNumber: 10
            },
        ],
        invalid: [
            {
                line: "/* /index.html 200",
                lineNumber: 2,
                message: invalidRedirectError
            },
            {
                line: "/* /index 200",
                lineNumber: 3,
                message: invalidRedirectError
            },
            {
                line: "/ /index.html",
                lineNumber: 4,
                message: invalidRedirectError
            },
            {
                line: "/ /index",
                lineNumber: 5,
                message: invalidRedirectError
            },
            {
                line: "/* /foo/index.html",
                lineNumber: 6,
                message: invalidRedirectError
            },
        ]
    });
});

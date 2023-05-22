"use strict";
exports.__esModule = true;
var parseHeaders_1 = require("../..//metadata-generator/parseHeaders");
test("parseHeaders should reject malformed initial lines", function () {
    var input = "\n    # A single token before a path\n    c\n    # A header before a path\n    Access-Control-Allow-Origin: *\n  ";
    var result = (0, parseHeaders_1.parseHeaders)(input);
    expect(result).toEqual({
        rules: [],
        invalid: [
            {
                line: "c",
                lineNumber: 3,
                message: "Expected a path beginning with at least one forward-slash"
            },
            {
                line: "Access-Control-Allow-Origin: *",
                lineNumber: 5,
                message: "Path should come before header (access-control-allow-origin: *)"
            },
        ]
    });
});
test("parseHeaders should reject invalid headers", function () {
    var input = "\n    # Valid header sails through\n    /a\n      Name:       Value\n    #\n    /b\n      I'm invalid!\n      !x-content-type\n      But: I'm okay!\n      ! Content-Type: application/json\n  ";
    var result = (0, parseHeaders_1.parseHeaders)(input);
    expect(result).toEqual({
        rules: [
            { path: "/a", headers: { name: "Value" }, unsetHeaders: [] },
            { path: "/b", headers: { but: "I'm okay!" }, unsetHeaders: [] },
        ],
        invalid: [
            {
                line: "I'm invalid!",
                lineNumber: 7,
                message: "Expected a colon-separated header pair (e.g. name: value)"
            },
            {
                line: "!x-content-type",
                lineNumber: 8,
                message: "Expected a colon-separated header pair (e.g. name: value)"
            },
            {
                line: "! Content-Type: application/json",
                lineNumber: 10,
                message: "Header name cannot include spaces"
            },
        ]
    });
});
test("parseHeaders should reject lines longer than 2000 chars", function () {
    var huge_line = "".concat(Array(1001).fill("a").join(""), ": ").concat(Array(1001)
        .fill("b")
        .join(""));
    var input = "\n    # Valid entry\n    /a\n      Name: Value\n    # Jumbo comment line OK, ignored as normal\n    ".concat(Array(1001).fill("#").join(""), "\n    # Huge path names rejected\n    /b\n      Name: Value\n      ").concat(huge_line, "\n  ");
    var result = (0, parseHeaders_1.parseHeaders)(input);
    expect(result).toEqual({
        rules: [
            { path: "/a", headers: { name: "Value" }, unsetHeaders: [] },
            { path: "/b", headers: { name: "Value" }, unsetHeaders: [] },
        ],
        invalid: [
            {
                message: "Ignoring line 10 as it exceeds the maximum allowed length of 2000."
            },
        ]
    });
});
test("parseHeaders should reject any rules after the first 100", function () {
    var input = "\n    # COMMENTS DON'T COUNT TOWARDS TOTAL VALID RULES\n    ".concat(Array(150)
        .fill(undefined)
        .map(function (_, i) { return "/a/".concat(i, "\nx-index: ").concat(i); })
        .join("\n"), "\n    # BUT DO GET COUNTED AS TOTAL LINES SKIPPED\n  ");
    expect((0, parseHeaders_1.parseHeaders)(input)).toEqual({
        rules: Array(101)
            .fill(undefined)
            .map(function (_, i) { return ({
            path: "/a/" + i,
            headers: { "x-index": "".concat(i) },
            unsetHeaders: []
        }); }),
        invalid: [
            {
                message: "Maximum number of rules supported is 100. Skipping remaining 100 lines of file."
            },
        ]
    });
});
test("parseHeaders should reject malformed URLs", function () {
    var input = "\n  # Spaces should be URI encoded\n  /some page with spaces\n    valid: yup\n  # OK with URL escaped encoding\n  /some%20page\n    valid: yup\n  # Unescaped URLs are handled OK by Deno, so escape & pass them through\n  /://so;`me\n    valid: yup\n  /nons:/&@%+~{}ense\n    valid: yup\n  # Absolute URLs with a non-https protocol should be rejected\n  https://yeah.com\n    valid: yup\n  http://nah.com/blog\n    invalid: things\n  //yeah.com/blog\n    valid: things\n  /yeah\n    valid: yup\n  /yeah.com\n    valid: yup\n  # Anything standalone is interpreted as a invalid header pair\n  nah.com\n  :\n  test:\n";
    var result = (0, parseHeaders_1.parseHeaders)(input);
    expect(result).toEqual({
        invalid: [
            {
                line: "http://nah.com/blog",
                lineNumber: 16,
                message: 'URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").'
            },
            {
                line: "invalid: things",
                lineNumber: 17,
                message: "Path should come before header (invalid: things)"
            },
            {
                line: "nah.com",
                lineNumber: 25,
                message: "Expected a colon-separated header pair (e.g. name: value)"
            },
            { line: ":", lineNumber: 26, message: "No header name specified" },
            { line: "test:", lineNumber: 27, message: "No header value specified" },
        ],
        rules: [
            {
                path: "/some%20page%20with%20spaces",
                headers: { valid: "yup" },
                unsetHeaders: []
            },
            { path: "/some%20page", headers: { valid: "yup" }, unsetHeaders: [] },
            { path: "/://so;%60me", headers: { valid: "yup" }, unsetHeaders: [] },
            {
                path: "/nons:/&@%+~%7B%7Dense",
                headers: { valid: "yup" },
                unsetHeaders: []
            },
            {
                path: "https://yeah.com/",
                headers: { valid: "yup" },
                unsetHeaders: []
            },
            {
                path: "//yeah.com/blog",
                headers: { valid: "things" },
                unsetHeaders: []
            },
            { path: "/yeah", headers: { valid: "yup" }, unsetHeaders: [] },
            { path: "/yeah.com", headers: { valid: "yup" }, unsetHeaders: [] },
        ]
    });
});

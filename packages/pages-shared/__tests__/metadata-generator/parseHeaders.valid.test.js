"use strict";
exports.__esModule = true;
var parseHeaders_1 = require("../..//metadata-generator/parseHeaders");
test("parseHeaders should handle a single rule", function () {
    var input = "/a\n  Name: Value";
    var result = (0, parseHeaders_1.parseHeaders)(input);
    expect(result).toEqual({
        rules: [{ path: "/a", headers: { name: "Value" }, unsetHeaders: [] }],
        invalid: []
    });
});
test("parseHeaders should handle headers with exclamation marks", function () {
    var input = "/a\n  !Name: Value";
    var result = (0, parseHeaders_1.parseHeaders)(input);
    expect(result).toEqual({
        rules: [{ path: "/a", headers: { "!name": "Value" }, unsetHeaders: [] }],
        invalid: []
    });
});
test("parseHeaders should ignore blank lines", function () {
    var input = "\n/a\n\nName: Value\n\n";
    var result = (0, parseHeaders_1.parseHeaders)(input);
    expect(result).toEqual({
        rules: [{ path: "/a", headers: { name: "Value" }, unsetHeaders: [] }],
        invalid: []
    });
});
test("parseHeaders should trim whitespace", function () {
    var input = "\n                /a\n    Name         :           Value\n";
    var result = (0, parseHeaders_1.parseHeaders)(input);
    expect(result).toEqual({
        rules: [{ path: "/a", headers: { name: "Value" }, unsetHeaders: [] }],
        invalid: []
    });
});
test("parseHeaders should ignore comments", function () {
    var input = "\n  # This is a comment\n  /a\n  # And one here too.\n  Name: Value\n";
    var result = (0, parseHeaders_1.parseHeaders)(input);
    expect(result).toEqual({
        rules: [{ path: "/a", headers: { name: "Value" }, unsetHeaders: [] }],
        invalid: []
    });
});
test("parseHeaders should combine headers together", function () {
    var input = "\n  /a\n    Set-Cookie: test=cookie; expires=never\n    Set-Cookie: another=cookie; magic!\n\n  /b\n    A: ABBA\n    B: BABA\n";
    var result = (0, parseHeaders_1.parseHeaders)(input);
    expect(result).toEqual({
        rules: [
            {
                path: "/a",
                headers: {
                    "set-cookie": "test=cookie; expires=never, another=cookie; magic!"
                },
                unsetHeaders: []
            },
            {
                path: "/b",
                headers: { a: "ABBA", b: "BABA" },
                unsetHeaders: []
            },
        ],
        invalid: []
    });
});
test("parseHeaders should support setting hosts", function () {
    var input = "\n  https://example.com\n    a: a\n  https://example.com/\n    b: b\n  https://example.com/blog\n    c: c\n  /blog\n    d:d\n  https://:subdomain.example.*/path\n    e:e\n";
    var result = (0, parseHeaders_1.parseHeaders)(input);
    expect(result).toEqual({
        rules: [
            { path: "https://example.com/", headers: { a: "a" }, unsetHeaders: [] },
            { path: "https://example.com/", headers: { b: "b" }, unsetHeaders: [] },
            {
                path: "https://example.com/blog",
                headers: { c: "c" },
                unsetHeaders: []
            },
            { path: "/blog", headers: { d: "d" }, unsetHeaders: [] },
            {
                path: "https://:subdomain.example.*/path",
                headers: { e: "e" },
                unsetHeaders: []
            },
        ],
        invalid: []
    });
});
test("parseHeaders should add unset headers", function () {
    var input = "/a\n  Name: Value\n  ! Place";
    var result = (0, parseHeaders_1.parseHeaders)(input);
    expect(result).toEqual({
        rules: [
            { path: "/a", headers: { name: "Value" }, unsetHeaders: ["Place"] },
        ],
        invalid: []
    });
});

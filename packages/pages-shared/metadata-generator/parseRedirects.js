"use strict";
exports.__esModule = true;
exports.parseRedirects = void 0;
var constants_1 = require("./constants");
var validateURL_1 = require("./validateURL");
function parseRedirects(input) {
    var lines = input.split("\n");
    var rules = [];
    var seen_paths = new Set();
    var invalid = [];
    var staticRules = 0;
    var dynamicRules = 0;
    var canCreateStaticRule = true;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.length === 0 || line.startsWith("#"))
            continue;
        if (line.length > constants_1.MAX_LINE_LENGTH) {
            invalid.push({
                message: "Ignoring line ".concat(i + 1, " as it exceeds the maximum allowed length of ").concat(constants_1.MAX_LINE_LENGTH, ".")
            });
            continue;
        }
        var tokens = line.split(/\s+/);
        if (tokens.length < 2 || tokens.length > 3) {
            invalid.push({
                line: line,
                lineNumber: i + 1,
                message: "Expected exactly 2 or 3 whitespace-separated tokens. Got ".concat(tokens.length, ".")
            });
            continue;
        }
        var _a = tokens, str_from = _a[0], str_to = _a[1], _b = _a[2], str_status = _b === void 0 ? "302" : _b;
        var fromResult = (0, validateURL_1.validateUrl)(str_from, true, false, false);
        if (fromResult[0] === undefined) {
            invalid.push({
                line: line,
                lineNumber: i + 1,
                message: fromResult[1]
            });
            continue;
        }
        var from = fromResult[0];
        if (canCreateStaticRule &&
            !from.match(constants_1.SPLAT_REGEX) &&
            !from.match(constants_1.PLACEHOLDER_REGEX)) {
            staticRules += 1;
            if (staticRules > constants_1.MAX_STATIC_REDIRECT_RULES) {
                invalid.push({
                    message: "Maximum number of static rules supported is ".concat(constants_1.MAX_STATIC_REDIRECT_RULES, ". Skipping line.")
                });
                continue;
            }
        }
        else {
            dynamicRules += 1;
            canCreateStaticRule = false;
            if (dynamicRules > constants_1.MAX_DYNAMIC_REDIRECT_RULES) {
                invalid.push({
                    message: "Maximum number of dynamic rules supported is ".concat(constants_1.MAX_DYNAMIC_REDIRECT_RULES, ". Skipping remaining ").concat(lines.length - i, " lines of file.")
                });
                break;
            }
        }
        var toResult = (0, validateURL_1.validateUrl)(str_to, false, true, true);
        if (toResult[0] === undefined) {
            invalid.push({
                line: line,
                lineNumber: i + 1,
                message: toResult[1]
            });
            continue;
        }
        var to = toResult[0];
        var status_1 = Number(str_status);
        if (isNaN(status_1) || !constants_1.PERMITTED_STATUS_CODES.has(status_1)) {
            invalid.push({
                line: line,
                lineNumber: i + 1,
                message: "Valid status codes are 200, 301, 302 (default), 303, 307, or 308. Got ".concat(str_status, ".")
            });
            continue;
        }
        // We want to always block the `/* /index.html` redirect - this will cause TOO_MANY_REDIRECTS errors as
        // the asset server will redirect it back to `/`, removing the `/index.html`. This is the case for regular
        // redirects, as well as proxied (200) rewrites. We only want to run this on relative urls
        if (/\/\*?$/.test(from) && /\/index(.html)?$/.test(to) && !(0, validateURL_1.urlHasHost)(to)) {
            invalid.push({
                line: line,
                lineNumber: i + 1,
                message: "Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again. Please fix or remove this rule to silence this warning."
            });
            continue;
        }
        if (seen_paths.has(from)) {
            invalid.push({
                line: line,
                lineNumber: i + 1,
                message: "Ignoring duplicate rule for path ".concat(from, ".")
            });
            continue;
        }
        seen_paths.add(from);
        if (status_1 === 200) {
            if ((0, validateURL_1.urlHasHost)(to)) {
                invalid.push({
                    line: line,
                    lineNumber: i + 1,
                    message: "Proxy (200) redirects can only point to relative paths. Got ".concat(to)
                });
                continue;
            }
        }
        rules.push({ from: from, to: to, status: status_1, lineNumber: i + 1 });
    }
    return {
        rules: rules,
        invalid: invalid
    };
}
exports.parseRedirects = parseRedirects;

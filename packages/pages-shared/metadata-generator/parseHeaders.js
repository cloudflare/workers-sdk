"use strict";
exports.__esModule = true;
exports.parseHeaders = void 0;
var constants_1 = require("./constants");
var validateURL_1 = require("./validateURL");
// Not strictly necessary to check for all protocols-like beginnings, since _technically_ that could be a legit header (e.g. name=http, value=://I'm a value).
// But we're checking here since some people might be caught out and it'll help 99.9% of people who get it wrong.
// We do the proper validation in `validateUrl` anyway :)
var LINE_IS_PROBABLY_A_PATH = new RegExp(/^([^\s]+:\/\/|^\/)/);
function parseHeaders(input) {
    var lines = input.split("\n");
    var rules = [];
    var invalid = [];
    var rule = undefined;
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
        if (LINE_IS_PROBABLY_A_PATH.test(line)) {
            if (rules.length >= constants_1.MAX_HEADER_RULES) {
                invalid.push({
                    message: "Maximum number of rules supported is ".concat(constants_1.MAX_HEADER_RULES, ". Skipping remaining ").concat(lines.length - i, " lines of file.")
                });
                break;
            }
            if (rule) {
                if (isValidRule(rule)) {
                    rules.push({
                        path: rule.path,
                        headers: rule.headers,
                        unsetHeaders: rule.unsetHeaders
                    });
                }
                else {
                    invalid.push({
                        line: rule.line,
                        lineNumber: i + 1,
                        message: "No headers specified"
                    });
                }
            }
            var _a = (0, validateURL_1.validateUrl)(line), path = _a[0], pathError = _a[1];
            if (pathError) {
                invalid.push({
                    line: line,
                    lineNumber: i + 1,
                    message: pathError
                });
                rule = undefined;
                continue;
            }
            rule = {
                path: path,
                line: line,
                headers: {},
                unsetHeaders: []
            };
            continue;
        }
        if (!line.includes(constants_1.HEADER_SEPARATOR)) {
            if (!rule) {
                invalid.push({
                    line: line,
                    lineNumber: i + 1,
                    message: "Expected a path beginning with at least one forward-slash"
                });
            }
            else {
                if (line.trim().startsWith(constants_1.UNSET_OPERATOR)) {
                    rule.unsetHeaders.push(line.trim().replace(constants_1.UNSET_OPERATOR, ""));
                }
                else {
                    invalid.push({
                        line: line,
                        lineNumber: i + 1,
                        message: "Expected a colon-separated header pair (e.g. name: value)"
                    });
                }
            }
            continue;
        }
        var _b = line.split(constants_1.HEADER_SEPARATOR), rawName = _b[0], rawValue = _b.slice(1);
        var name_1 = rawName.trim().toLowerCase();
        if (name_1.includes(" ")) {
            invalid.push({
                line: line,
                lineNumber: i + 1,
                message: "Header name cannot include spaces"
            });
            continue;
        }
        var value = rawValue.join(constants_1.HEADER_SEPARATOR).trim();
        if (name_1 === "") {
            invalid.push({
                line: line,
                lineNumber: i + 1,
                message: "No header name specified"
            });
            continue;
        }
        if (value === "") {
            invalid.push({
                line: line,
                lineNumber: i + 1,
                message: "No header value specified"
            });
            continue;
        }
        if (!rule) {
            invalid.push({
                line: line,
                lineNumber: i + 1,
                message: "Path should come before header (".concat(name_1, ": ").concat(value, ")")
            });
            continue;
        }
        var existingValues = rule.headers[name_1];
        rule.headers[name_1] = existingValues ? "".concat(existingValues, ", ").concat(value) : value;
    }
    if (rule) {
        if (isValidRule(rule)) {
            rules.push({
                path: rule.path,
                headers: rule.headers,
                unsetHeaders: rule.unsetHeaders
            });
        }
        else {
            invalid.push({ line: rule.line, message: "No headers specified" });
        }
    }
    return {
        rules: rules,
        invalid: invalid
    };
}
exports.parseHeaders = parseHeaders;
function isValidRule(rule) {
    return Object.keys(rule.headers).length > 0 || rule.unsetHeaders.length > 0;
}

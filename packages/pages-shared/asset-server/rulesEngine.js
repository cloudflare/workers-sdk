"use strict";
exports.__esModule = true;
exports.generateRulesMatcher = exports.replacer = void 0;
// Taken from https://stackoverflow.com/a/3561711
// which is everything from the tc39 proposal, plus the following two characters: ^/
// It's also everything included in the URLPattern escape (https://wicg.github.io/urlpattern/#escape-a-regexp-string), plus the following: -
// As the answer says, there's no downside to escaping these extra characters, so better safe than sorry
var ESCAPE_REGEX_CHARACTERS = /[-/\\^$*+?.()|[\]{}]/g;
var escapeRegex = function (str) {
    return str.replace(ESCAPE_REGEX_CHARACTERS, "\\$&");
};
// Placeholder names must begin with a colon, be alphanumeric and optionally contain underscores.
// e.g. :place_123_holder
var HOST_PLACEHOLDER_REGEX = /(?<=^https:\\\/\\\/[^/]*?):([^\\]+)(?=\\)/g;
var PLACEHOLDER_REGEX = /:(\w+)/g;
var replacer = function (str, replacements) {
    for (var _i = 0, _a = Object.entries(replacements); _i < _a.length; _i++) {
        var _b = _a[_i], replacement = _b[0], value = _b[1];
        str = str.replaceAll(":".concat(replacement), value);
    }
    return str;
};
exports.replacer = replacer;
var generateRulesMatcher = function (rules, replacerFn) {
    if (replacerFn === void 0) { replacerFn = function (match) { return match; }; }
    if (!rules)
        return function () { return []; };
    var compiledRules = Object.entries(rules)
        .map(function (_a) {
        var rule = _a[0], match = _a[1];
        var crossHost = rule.startsWith("https://");
        // Create :splat capturer then escape.
        rule = rule.split("*").map(escapeRegex).join("(?<splat>.*)");
        // Create :placeholder capturers (already escaped).
        // For placeholders in the host, we separate at forward slashes and periods.
        // For placeholders in the path, we separate at forward slashes.
        // This matches the behavior of URLPattern.
        // e.g. https://:subdomain.domain/ -> https://(here).domain/
        // e.g. /static/:file -> /static/(image.jpg)
        // e.g. /blog/:post -> /blog/(an-exciting-post)
        var host_matches = rule.matchAll(HOST_PLACEHOLDER_REGEX);
        for (var _i = 0, host_matches_1 = host_matches; _i < host_matches_1.length; _i++) {
            var host_match = host_matches_1[_i];
            rule = rule.split(host_match[0]).join("(?<".concat(host_match[1], ">[^/.]+)"));
        }
        var path_matches = rule.matchAll(PLACEHOLDER_REGEX);
        for (var _b = 0, path_matches_1 = path_matches; _b < path_matches_1.length; _b++) {
            var path_match = path_matches_1[_b];
            rule = rule.split(path_match[0]).join("(?<".concat(path_match[1], ">[^/]+)"));
        }
        // Wrap in line terminators to be safe.
        rule = "^" + rule + "$";
        try {
            var regExp = new RegExp(rule);
            return [{ crossHost: crossHost, regExp: regExp }, match];
        }
        catch (_c) { }
    })
        .filter(function (value) { return value !== undefined; });
    return function (_a) {
        var request = _a.request;
        var _b = new URL(request.url), pathname = _b.pathname, host = _b.host;
        return compiledRules
            .map(function (_a) {
            var _b = _a[0], crossHost = _b.crossHost, regExp = _b.regExp, match = _a[1];
            var test = crossHost ? "https://".concat(host).concat(pathname) : pathname;
            var result = regExp.exec(test);
            if (result) {
                return replacerFn(match, result.groups || {});
            }
        })
            .filter(function (value) { return value !== undefined; });
    };
};
exports.generateRulesMatcher = generateRulesMatcher;

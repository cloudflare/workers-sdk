"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
exports.__esModule = true;
exports.createMetadataObject = void 0;
var constants_1 = require("./constants");
function createMetadataObject(_a) {
    var redirects = _a.redirects, headers = _a.headers, webAnalyticsToken = _a.webAnalyticsToken, deploymentId = _a.deploymentId, failOpen = _a.failOpen, _b = _a.logger, logger = _b === void 0 ? function (_message) { } : _b;
    return __assign(__assign(__assign(__assign({}, constructRedirects({ redirects: redirects, logger: logger })), constructHeaders({ headers: headers, logger: logger })), constructWebAnalytics({ webAnalyticsToken: webAnalyticsToken, logger: logger })), { deploymentId: deploymentId, failOpen: failOpen });
}
exports.createMetadataObject = createMetadataObject;
function constructRedirects(_a) {
    var redirects = _a.redirects, logger = _a.logger;
    if (!redirects)
        return {};
    var num_valid = redirects.rules.length;
    var num_invalid = redirects.invalid.length;
    logger("Parsed ".concat(num_valid, " valid redirect rule").concat(num_valid === 1 ? "" : "s", "."));
    if (num_invalid > 0) {
        logger("Found invalid redirect lines:");
        for (var _i = 0, _b = redirects.invalid; _i < _b.length; _i++) {
            var _c = _b[_i], line = _c.line, lineNumber = _c.lineNumber, message = _c.message;
            if (line)
                logger("  - ".concat(lineNumber ? "#".concat(lineNumber, ": ") : "").concat(line));
            logger("    ".concat(message));
        }
    }
    /* Better to return no Redirects object at all than one with empty rules */
    if (num_valid === 0) {
        return {};
    }
    var staticRedirects = {};
    var dynamicRedirects = {};
    var canCreateStaticRule = true;
    for (var _d = 0, _e = redirects.rules; _d < _e.length; _d++) {
        var rule = _e[_d];
        if (!rule.from.match(constants_1.SPLAT_REGEX) && !rule.from.match(constants_1.PLACEHOLDER_REGEX)) {
            if (canCreateStaticRule) {
                staticRedirects[rule.from] = {
                    status: rule.status,
                    to: rule.to,
                    lineNumber: rule.lineNumber
                };
                continue;
            }
            else {
                logger("Info: the redirect rule ".concat(rule.from, " \u2192 ").concat(rule.status, " ").concat(rule.to, " could be made more performant by bringing it above any lines with splats or placeholders."));
            }
        }
        dynamicRedirects[rule.from] = { status: rule.status, to: rule.to };
        canCreateStaticRule = false;
    }
    return {
        redirects: {
            version: constants_1.REDIRECTS_VERSION,
            staticRules: staticRedirects,
            rules: dynamicRedirects
        }
    };
}
function constructHeaders(_a) {
    var headers = _a.headers, logger = _a.logger;
    if (!headers)
        return {};
    var num_valid = headers.rules.length;
    var num_invalid = headers.invalid.length;
    logger("Parsed ".concat(num_valid, " valid header rule").concat(num_valid === 1 ? "" : "s", "."));
    if (num_invalid > 0) {
        logger("Found invalid header lines:");
        for (var _i = 0, _b = headers.invalid; _i < _b.length; _i++) {
            var _c = _b[_i], line = _c.line, lineNumber = _c.lineNumber, message = _c.message;
            if (line)
                logger("  - ".concat(lineNumber ? "#".concat(lineNumber, ": ") : "", " ").concat(line));
            logger("    ".concat(message));
        }
    }
    /* Better to return no Headers object at all than one with empty rules */
    if (num_valid === 0) {
        return {};
    }
    var rules = {};
    for (var _d = 0, _e = headers.rules; _d < _e.length; _d++) {
        var rule = _e[_d];
        rules[rule.path] = {};
        if (Object.keys(rule.headers).length) {
            rules[rule.path].set = rule.headers;
        }
        if (rule.unsetHeaders.length) {
            rules[rule.path].unset = rule.unsetHeaders;
        }
    }
    return {
        headers: {
            version: constants_1.HEADERS_VERSION,
            rules: rules
        }
    };
}
function constructWebAnalytics(_a) {
    var webAnalyticsToken = _a.webAnalyticsToken;
    if (!webAnalyticsToken)
        return {};
    return {
        analytics: {
            version: constants_1.ANALYTICS_VERSION,
            token: webAnalyticsToken
        }
    };
}

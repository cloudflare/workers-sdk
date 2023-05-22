"use strict";
exports.__esModule = true;
exports.urlHasHost = exports.validateUrl = exports.extractPathname = void 0;
var extractPathname = function (path, includeSearch, includeHash) {
    if (path === void 0) { path = "/"; }
    if (!path.startsWith("/"))
        path = "/".concat(path);
    var url = new URL("//".concat(path), "relative://");
    return "".concat(url.pathname).concat(includeSearch ? url.search : "").concat(includeHash ? url.hash : "");
};
exports.extractPathname = extractPathname;
var URL_REGEX = /^https:\/\/+(?<host>[^/]+)\/?(?<path>.*)/;
var PATH_REGEX = /^\//;
var validateUrl = function (token, onlyRelative, includeSearch, includeHash) {
    if (onlyRelative === void 0) { onlyRelative = false; }
    if (includeSearch === void 0) { includeSearch = false; }
    if (includeHash === void 0) { includeHash = false; }
    var host = URL_REGEX.exec(token);
    if (host && host.groups && host.groups.host) {
        if (onlyRelative)
            return [
                undefined,
                "Only relative URLs are allowed. Skipping absolute URL ".concat(token, "."),
            ];
        return [
            "https://".concat(host.groups.host).concat((0, exports.extractPathname)(host.groups.path, includeSearch, includeHash)),
            undefined,
        ];
    }
    else {
        if (!token.startsWith("/") && onlyRelative)
            token = "/".concat(token);
        var path = PATH_REGEX.exec(token);
        if (path) {
            try {
                return [(0, exports.extractPathname)(token, includeSearch, includeHash), undefined];
            }
            catch (_a) {
                return [undefined, "Error parsing URL segment ".concat(token, ". Skipping.")];
            }
        }
    }
    return [
        undefined,
        onlyRelative
            ? "URLs should begin with a forward-slash."
            : 'URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").',
    ];
};
exports.validateUrl = validateUrl;
function urlHasHost(token) {
    var host = URL_REGEX.exec(token);
    return Boolean(host && host.groups && host.groups.host);
}
exports.urlHasHost = urlHasHost;

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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.parseQualityWeightedList = exports.generateHandler = exports.normaliseHeaders = exports.ANALYTICS_VERSION = exports.HEADERS_VERSION_V1 = exports.HEADERS_VERSION = exports.REDIRECTS_VERSION = exports.CACHE_CONTROL_BROWSER = exports.ASSET_PRESERVATION_CACHE = void 0;
var responses_1 = require("./responses");
var rulesEngine_1 = require("./rulesEngine");
// Before serving a 404, we check the cache to see if we've served this asset recently
// and if so, serve it from the cache instead of responding with a 404.
// This gives a bit of a grace period between deployments for any clients browsing the old deployment.
exports.ASSET_PRESERVATION_CACHE = "assetPreservationCache";
var CACHE_CONTROL_PRESERVATION = "public, s-maxage=604800"; // 1 week
exports.CACHE_CONTROL_BROWSER = "public, max-age=0, must-revalidate"; // have the browser check in with the server to make sure its local cache is valid before using it
exports.REDIRECTS_VERSION = 1;
exports.HEADERS_VERSION = 2;
exports.HEADERS_VERSION_V1 = 1;
exports.ANALYTICS_VERSION = 1;
// In rolling this out, we're taking a conservative approach to only generate these Link headers from <link> elements that have these attributes.
// We'll ignore any <link> elements that contain other attributes (e.g. `fetchpriority`, `crossorigin` or `data-please-dont-generate-a-header`).
// We're not confident in browser support for all of these additional attributes, so we'll wait until we have that information before proceeding further.
var ALLOWED_EARLY_HINT_LINK_ATTRIBUTES = ["rel", "as", "href"];
// Takes metadata headers and "normalise" them
// to the latest version
function normaliseHeaders(headers) {
    if (headers.version === exports.HEADERS_VERSION) {
        return headers.rules;
    }
    else if (headers.version === exports.HEADERS_VERSION_V1) {
        return Object.keys(headers.rules).reduce(function (acc, key) {
            acc[key] = {
                set: headers.rules[key]
            };
            return acc;
        }, {});
    }
    else {
        return {};
    }
}
exports.normaliseHeaders = normaliseHeaders;
function generateHandler(_a) {
    var _this = this;
    var _b;
    var request = _a.request, metadata = _a.metadata, xServerEnvHeader = _a.xServerEnvHeader, xDeploymentIdHeader = _a.xDeploymentIdHeader, logError = _a.logError, findAssetEntryForPath = _a.findAssetEntryForPath, getAssetKey = _a.getAssetKey, negotiateContent = _a.negotiateContent, fetchAsset = _a.fetchAsset, _c = _a.generateNotFoundResponse, generateNotFoundResponse = _c === void 0 ? function (notFoundRequest, notFoundFindAssetEntryForPath, notFoundServeAsset) { return __awaiter(_this, void 0, void 0, function () {
        var assetEntry;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, notFoundFindAssetEntryForPath("/index.html")];
                case 1:
                    // No custom 404 page, so try serving as a single-page app
                    if ((assetEntry = _a.sent())) {
                        return [2 /*return*/, notFoundServeAsset(assetEntry, { preserve: false })];
                    }
                    return [2 /*return*/, new responses_1.NotFoundResponse()];
            }
        });
    }); } : _c, _d = _a.attachAdditionalHeaders, attachAdditionalHeaders = _d === void 0 ? function () { } : _d, caches = _a.caches, waitUntil = _a.waitUntil;
    return __awaiter(this, void 0, void 0, function () {
        function generateResponse() {
            return __awaiter(this, void 0, void 0, function () {
                var match, status_1, to, destination, location_1, extensionlessPath;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            match = staticRedirectsMatcher() || generateRedirectsMatcher()({ request: request })[0];
                            if (match) {
                                if (match.status === 200) {
                                    // A 200 redirect means that we are proxying to a different asset, for example,
                                    // a request with url /users/12345 could be pointed to /users/id.html. In order to
                                    // do this, we overwrite the pathname, and instead match for assets with that url,
                                    // and importantly, do not use the regular redirect handler - as the url visible to
                                    // the user does not change
                                    pathname = new URL(match.to, request.url).pathname;
                                }
                                else {
                                    status_1 = match.status, to = match.to;
                                    destination = new URL(to, request.url);
                                    location_1 = destination.origin === new URL(request.url).origin
                                        ? "".concat(destination.pathname).concat(destination.search || search).concat(destination.hash)
                                        : "".concat(destination.href).concat(destination.search ? "" : search).concat(destination.hash);
                                    switch (status_1) {
                                        case 301:
                                            return [2 /*return*/, new responses_1.MovedPermanentlyResponse(location_1, undefined, {
                                                    preventLeadingDoubleSlash: false
                                                })];
                                        case 303:
                                            return [2 /*return*/, new responses_1.SeeOtherResponse(location_1, undefined, {
                                                    preventLeadingDoubleSlash: false
                                                })];
                                        case 307:
                                            return [2 /*return*/, new responses_1.TemporaryRedirectResponse(location_1, undefined, {
                                                    preventLeadingDoubleSlash: false
                                                })];
                                        case 308:
                                            return [2 /*return*/, new responses_1.PermanentRedirectResponse(location_1, undefined, {
                                                    preventLeadingDoubleSlash: false
                                                })];
                                        case 302:
                                        default:
                                            return [2 /*return*/, new responses_1.FoundResponse(location_1, undefined, {
                                                    preventLeadingDoubleSlash: false
                                                })];
                                    }
                                }
                            }
                            if (!request.method.match(/^(get|head)$/i)) {
                                return [2 /*return*/, new responses_1.MethodNotAllowedResponse()];
                            }
                            try {
                                pathname = globalThis.decodeURIComponent(pathname);
                            }
                            catch (err) { }
                            if (!pathname.endsWith("/")) return [3 /*break*/, 5];
                            return [4 /*yield*/, findAssetEntryForPath("".concat(pathname, "index.html"))];
                        case 1:
                            if (!(assetEntry = _a.sent())) return [3 /*break*/, 2];
                            return [2 /*return*/, serveAsset(assetEntry)];
                        case 2:
                            if (!pathname.endsWith("/index/")) return [3 /*break*/, 3];
                            return [2 /*return*/, new responses_1.PermanentRedirectResponse("/".concat(pathname.slice(1, -"index/".length)).concat(search))];
                        case 3: return [4 /*yield*/, findAssetEntryForPath("".concat(pathname.replace(/\/$/, ".html")))];
                        case 4:
                            if ((assetEntry = _a.sent())) {
                                return [2 /*return*/, new responses_1.PermanentRedirectResponse("/".concat(pathname.slice(1, -1)).concat(search))];
                            }
                            else {
                                return [2 /*return*/, notFound()];
                            }
                            _a.label = 5;
                        case 5: return [4 /*yield*/, findAssetEntryForPath(pathname)];
                        case 6:
                            if (!(assetEntry = _a.sent())) return [3 /*break*/, 12];
                            if (!pathname.endsWith(".html")) return [3 /*break*/, 10];
                            extensionlessPath = pathname.slice(0, -".html".length);
                            if (!extensionlessPath.endsWith("/index")) return [3 /*break*/, 7];
                            return [2 /*return*/, new responses_1.PermanentRedirectResponse("".concat(extensionlessPath.replace(/\/index$/, "/")).concat(search))];
                        case 7: return [4 /*yield*/, findAssetEntryForPath(extensionlessPath)];
                        case 8:
                            if ((_a.sent()) ||
                                extensionlessPath === "/") {
                                return [2 /*return*/, serveAsset(assetEntry)];
                            }
                            else {
                                return [2 /*return*/, new responses_1.PermanentRedirectResponse("".concat(extensionlessPath).concat(search))];
                            }
                            _a.label = 9;
                        case 9: return [3 /*break*/, 11];
                        case 10: return [2 /*return*/, serveAsset(assetEntry)];
                        case 11: return [3 /*break*/, 15];
                        case 12:
                            if (!pathname.endsWith("/index")) return [3 /*break*/, 13];
                            return [2 /*return*/, new responses_1.PermanentRedirectResponse("/".concat(pathname.slice(1, -"index".length)).concat(search))];
                        case 13: return [4 /*yield*/, findAssetEntryForPath("".concat(pathname, ".html"))];
                        case 14:
                            if ((assetEntry = _a.sent())) {
                                return [2 /*return*/, serveAsset(assetEntry)];
                            }
                            else if (hasFileExtension(pathname)) {
                                return [2 /*return*/, notFound()];
                            }
                            _a.label = 15;
                        case 15: return [4 /*yield*/, findAssetEntryForPath("".concat(pathname, "/index.html"))];
                        case 16:
                            if ((assetEntry = _a.sent())) {
                                return [2 /*return*/, new responses_1.PermanentRedirectResponse("".concat(pathname, "/").concat(search))];
                            }
                            else {
                                return [2 /*return*/, notFound()];
                            }
                            return [2 /*return*/];
                    }
                });
            });
        }
        function attachHeaders(response) {
            return __awaiter(this, void 0, void 0, function () {
                var existingHeaders, extraHeaders, headers, preEarlyHintsHeaders_1, earlyHintsCacheKey_1, earlyHintsResponse, earlyHintsLinkHeader, clonedResponse_1, headersMatcher, matches, setMap;
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            existingHeaders = new Headers(response.headers);
                            extraHeaders = new Headers(__assign({ "access-control-allow-origin": "*", "referrer-policy": "strict-origin-when-cross-origin" }, (existingHeaders.has("content-type")
                                ? { "x-content-type-options": "nosniff" }
                                : {})));
                            headers = new Headers(__assign(__assign({}, Object.fromEntries(existingHeaders.entries())), Object.fromEntries(extraHeaders.entries())));
                            if (!earlyHintsCache) return [3 /*break*/, 2];
                            preEarlyHintsHeaders_1 = new Headers(headers);
                            earlyHintsCacheKey_1 = "".concat(protocol, "//").concat(host).concat(pathname);
                            return [4 /*yield*/, earlyHintsCache.match(earlyHintsCacheKey_1)];
                        case 1:
                            earlyHintsResponse = _a.sent();
                            if (earlyHintsResponse) {
                                earlyHintsLinkHeader = earlyHintsResponse.headers.get("Link");
                                if (earlyHintsLinkHeader) {
                                    headers.set("Link", earlyHintsLinkHeader);
                                }
                            }
                            clonedResponse_1 = response.clone();
                            if (waitUntil) {
                                waitUntil((function () { return __awaiter(_this, void 0, void 0, function () {
                                    var links_1, transformedResponse, linkHeader, err_1;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                _a.trys.push([0, 4, , 5]);
                                                links_1 = [];
                                                transformedResponse = new HTMLRewriter()
                                                    .on("link[rel~=preconnect],link[rel~=preload]", {
                                                    element: function (element) {
                                                        for (var _i = 0, _a = element.attributes; _i < _a.length; _i++) {
                                                            var attributeName = _a[_i][0];
                                                            if (!ALLOWED_EARLY_HINT_LINK_ATTRIBUTES.includes(attributeName.toLowerCase())) {
                                                                return;
                                                            }
                                                        }
                                                        var href = element.getAttribute("href") || undefined;
                                                        var rel = element.getAttribute("rel") || undefined;
                                                        var as = element.getAttribute("as") || undefined;
                                                        if (href && !href.startsWith("data:") && rel) {
                                                            links_1.push({ href: href, rel: rel, as: as });
                                                        }
                                                    }
                                                })
                                                    .transform(clonedResponse_1);
                                                // Needed to actually execute the HTMLRewriter handlers
                                                return [4 /*yield*/, transformedResponse.text()];
                                            case 1:
                                                // Needed to actually execute the HTMLRewriter handlers
                                                _a.sent();
                                                links_1.forEach(function (_a) {
                                                    var href = _a.href, rel = _a.rel, as = _a.as;
                                                    var link = "<".concat(href, ">; rel=\"").concat(rel, "\"");
                                                    if (as) {
                                                        link += "; as=".concat(as);
                                                    }
                                                    preEarlyHintsHeaders_1.append("Link", link);
                                                });
                                                linkHeader = preEarlyHintsHeaders_1.get("Link");
                                                if (!linkHeader) return [3 /*break*/, 3];
                                                return [4 /*yield*/, earlyHintsCache.put(earlyHintsCacheKey_1, new Response(null, { headers: { Link: linkHeader } }))];
                                            case 2:
                                                _a.sent();
                                                _a.label = 3;
                                            case 3: return [3 /*break*/, 5];
                                            case 4:
                                                err_1 = _a.sent();
                                                return [3 /*break*/, 5];
                                            case 5: return [2 /*return*/];
                                        }
                                    });
                                }); })());
                            }
                            _a.label = 2;
                        case 2:
                            headersMatcher = (0, rulesEngine_1.generateRulesMatcher)(headerRules, function (_a, replacements) {
                                var _b = _a.set, set = _b === void 0 ? {} : _b, _c = _a.unset, unset = _c === void 0 ? [] : _c;
                                var replacedSet = {};
                                Object.keys(set).forEach(function (key) {
                                    replacedSet[key] = (0, rulesEngine_1.replacer)(set[key], replacements);
                                });
                                return {
                                    set: replacedSet,
                                    unset: unset
                                };
                            });
                            matches = headersMatcher({ request: request });
                            setMap = new Set();
                            // Apply every matched rule in order
                            matches.forEach(function (_a) {
                                var _b = _a.set, set = _b === void 0 ? {} : _b, _c = _a.unset, unset = _c === void 0 ? [] : _c;
                                unset.forEach(function (key) {
                                    headers["delete"](key);
                                });
                                Object.keys(set).forEach(function (key) {
                                    if (setMap.has(key.toLowerCase())) {
                                        headers.append(key, set[key]);
                                    }
                                    else {
                                        headers.set(key, set[key]);
                                        setMap.add(key.toLowerCase());
                                    }
                                });
                            });
                            // https://fetch.spec.whatwg.org/#null-body-status
                            return [2 /*return*/, new Response([101, 204, 205, 304].includes(response.status) ? null : response.body, {
                                    headers: headers,
                                    status: response.status,
                                    statusText: response.statusText
                                })];
                    }
                });
            });
        }
        function serveAsset(servingAssetEntry, options) {
            var _a;
            if (options === void 0) { options = { preserve: true }; }
            return __awaiter(this, void 0, void 0, function () {
                var content, assetKey, etag, weakEtag, ifNoneMatch, asset, headers, encodeBody, response, preservedResponse_1, err_2;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            try {
                                content = negotiateContent(request, servingAssetEntry);
                            }
                            catch (err) {
                                return [2 /*return*/, new responses_1.NotAcceptableResponse()];
                            }
                            assetKey = getAssetKey(servingAssetEntry, content);
                            etag = "\"".concat(assetKey, "\"");
                            weakEtag = "W/".concat(etag);
                            ifNoneMatch = request.headers.get("if-none-match");
                            // We sometimes downgrade strong etags to a weak ones, so we need to check for both
                            if (ifNoneMatch === weakEtag || ifNoneMatch === etag) {
                                return [2 /*return*/, new responses_1.NotModifiedResponse()];
                            }
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, fetchAsset(assetKey)];
                        case 2:
                            asset = _b.sent();
                            headers = {
                                etag: etag,
                                "content-type": asset.contentType
                            };
                            encodeBody = "automatic";
                            if (xServerEnvHeader) {
                                headers["x-server-env"] = xServerEnvHeader;
                            }
                            if (xDeploymentIdHeader && metadata.deploymentId) {
                                headers["x-deployment-id"] = metadata.deploymentId;
                            }
                            if (content.encoding) {
                                encodeBody = "manual";
                                headers["cache-control"] = "no-transform";
                                headers["content-encoding"] = content.encoding;
                            }
                            response = new responses_1.OkResponse(request.method === "HEAD" ? null : asset.body, {
                                headers: headers,
                                encodeBody: encodeBody
                            });
                            if (isCacheable(request)) {
                                response.headers.append("cache-control", exports.CACHE_CONTROL_BROWSER);
                            }
                            attachAdditionalHeaders(response, content, servingAssetEntry, asset);
                            if (isPreview(new URL(request.url))) {
                                response.headers.set("x-robots-tag", "noindex");
                            }
                            if (options.preserve) {
                                preservedResponse_1 = new Response([101, 204, 205, 304].includes(response.status)
                                    ? null
                                    : response.clone().body, response);
                                preservedResponse_1.headers.set("cache-control", CACHE_CONTROL_PRESERVATION);
                                preservedResponse_1.headers.set("x-robots-tag", "noindex");
                                if (waitUntil && caches) {
                                    waitUntil(caches
                                        .open(exports.ASSET_PRESERVATION_CACHE)
                                        .then(function (assetPreservationCache) {
                                        return assetPreservationCache.put(request.url, preservedResponse_1);
                                    })["catch"](function (err) {
                                        logError(err);
                                    }));
                                }
                            }
                            if (asset.contentType.startsWith("text/html") &&
                                ((_a = metadata.analytics) === null || _a === void 0 ? void 0 : _a.version) === exports.ANALYTICS_VERSION) {
                                return [2 /*return*/, new HTMLRewriter()
                                        .on("body", {
                                        element: function (e) {
                                            var _a;
                                            e.append("<!-- Cloudflare Pages Analytics --><script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{\"token\": \"".concat((_a = metadata.analytics) === null || _a === void 0 ? void 0 : _a.token, "\"}'></script><!-- Cloudflare Pages Analytics -->"), { html: true });
                                        }
                                    })
                                        .transform(response)];
                            }
                            return [2 /*return*/, response];
                        case 3:
                            err_2 = _b.sent();
                            logError(err_2);
                            return [2 /*return*/, new responses_1.InternalServerErrorResponse(err_2)];
                        case 4: return [2 /*return*/];
                    }
                });
            });
        }
        function notFound() {
            return __awaiter(this, void 0, void 0, function () {
                var assetPreservationCache, preservedResponse, cwd, content, assetKey, _a, body, contentType, response, err_3;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            if (!caches) return [3 /*break*/, 3];
                            return [4 /*yield*/, caches.open(exports.ASSET_PRESERVATION_CACHE)];
                        case 1:
                            assetPreservationCache = _b.sent();
                            return [4 /*yield*/, assetPreservationCache.match(request.url)];
                        case 2:
                            preservedResponse = _b.sent();
                            if (preservedResponse) {
                                return [2 /*return*/, preservedResponse];
                            }
                            _b.label = 3;
                        case 3:
                            cwd = pathname;
                            _b.label = 4;
                        case 4:
                            if (!cwd) return [3 /*break*/, 10];
                            cwd = cwd.slice(0, cwd.lastIndexOf("/"));
                            return [4 /*yield*/, findAssetEntryForPath("".concat(cwd, "/404.html"))];
                        case 5:
                            if (!(assetEntry = _b.sent())) return [3 /*break*/, 9];
                            content = void 0;
                            try {
                                content = negotiateContent(request, assetEntry);
                            }
                            catch (err) {
                                return [2 /*return*/, new responses_1.NotAcceptableResponse()];
                            }
                            assetKey = getAssetKey(assetEntry, content);
                            _b.label = 6;
                        case 6:
                            _b.trys.push([6, 8, , 9]);
                            return [4 /*yield*/, fetchAsset(assetKey)];
                        case 7:
                            _a = _b.sent(), body = _a.body, contentType = _a.contentType;
                            response = new responses_1.NotFoundResponse(body);
                            response.headers.set("content-type", contentType);
                            return [2 /*return*/, response];
                        case 8:
                            err_3 = _b.sent();
                            logError(err_3);
                            return [2 /*return*/, new responses_1.InternalServerErrorResponse(err_3)];
                        case 9: return [3 /*break*/, 4];
                        case 10: return [4 /*yield*/, generateNotFoundResponse(request, findAssetEntryForPath, serveAsset)];
                        case 11: return [2 /*return*/, _b.sent()];
                    }
                });
            });
        }
        var url, protocol, host, search, pathname, earlyHintsCache, _e, headerRules, staticRules, staticRedirectsMatcher, generateRedirectsMatcher, assetEntry, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    url = new URL(request.url);
                    protocol = url.protocol, host = url.host, search = url.search;
                    pathname = url.pathname;
                    if (!metadata.deploymentId) return [3 /*break*/, 2];
                    return [4 /*yield*/, (caches === null || caches === void 0 ? void 0 : caches.open("eh:".concat(metadata.deploymentId)))];
                case 1:
                    _e = _g.sent();
                    return [3 /*break*/, 3];
                case 2:
                    _e = undefined;
                    _g.label = 3;
                case 3:
                    earlyHintsCache = _e;
                    headerRules = metadata.headers
                        ? normaliseHeaders(metadata.headers)
                        : {};
                    staticRules = ((_b = metadata.redirects) === null || _b === void 0 ? void 0 : _b.version) === exports.REDIRECTS_VERSION
                        ? metadata.redirects.staticRules || {}
                        : {};
                    staticRedirectsMatcher = function () {
                        var withHostMatch = staticRules["https://".concat(host).concat(pathname)];
                        var withoutHostMatch = staticRules[pathname];
                        if (withHostMatch && withoutHostMatch) {
                            if (withHostMatch.lineNumber < withoutHostMatch.lineNumber) {
                                return withHostMatch;
                            }
                            else {
                                return withoutHostMatch;
                            }
                        }
                        return withHostMatch || withoutHostMatch;
                    };
                    generateRedirectsMatcher = function () {
                        var _a;
                        return (0, rulesEngine_1.generateRulesMatcher)(((_a = metadata.redirects) === null || _a === void 0 ? void 0 : _a.version) === exports.REDIRECTS_VERSION
                            ? metadata.redirects.rules
                            : {}, function (_a, replacements) {
                            var status = _a.status, to = _a.to;
                            return ({
                                status: status,
                                to: (0, rulesEngine_1.replacer)(to, replacements)
                            });
                        });
                    };
                    _f = attachHeaders;
                    return [4 /*yield*/, generateResponse()];
                case 4: return [4 /*yield*/, _f.apply(void 0, [_g.sent()])];
                case 5: return [2 /*return*/, _g.sent()];
            }
        });
    });
}
exports.generateHandler = generateHandler;
// Parses a list such as "deflate, gzip;q=1.0, *;q=0.5" into
//   {deflate: 1, gzip: 1, *: 0.5}
function parseQualityWeightedList(list) {
    if (list === void 0) { list = ""; }
    var items = {};
    list
        .replace(/\s/g, "")
        .split(",")
        .forEach(function (el) {
        var _a = el.split(";q="), item = _a[0], weight = _a[1];
        items[item] = weight ? parseFloat(weight) : 1;
    });
    return items;
}
exports.parseQualityWeightedList = parseQualityWeightedList;
function isCacheable(request) {
    return !request.headers.has("authorization") && !request.headers.has("range");
}
function hasFileExtension(path) {
    return /\/.+\.[a-z0-9]+$/i.test(path);
}
// Parses a request URL hostname to determine if the request
// is from a project served in "preview" mode.
function isPreview(url) {
    if (url.hostname.endsWith(".pages.dev")) {
        return url.hostname.split(".").length > 3 ? true : false;
    }
    return false;
}

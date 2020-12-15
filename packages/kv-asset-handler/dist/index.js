"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalError = exports.NotFoundError = exports.MethodNotAllowedError = exports.serveSinglePageApp = exports.mapRequestToAsset = exports.getAssetFromKV = void 0;
var mime = require("mime");
var types_1 = require("./types");
Object.defineProperty(exports, "MethodNotAllowedError", { enumerable: true, get: function () { return types_1.MethodNotAllowedError; } });
Object.defineProperty(exports, "NotFoundError", { enumerable: true, get: function () { return types_1.NotFoundError; } });
Object.defineProperty(exports, "InternalError", { enumerable: true, get: function () { return types_1.InternalError; } });
var defaultCacheControl = {
    browserTTL: null,
    edgeTTL: 2 * 60 * 60 * 24,
    bypassCache: false,
};
function assignOptions(options) {
    // Assign any missing options passed in to the default
    return Object.assign({
        ASSET_NAMESPACE: __STATIC_CONTENT,
        ASSET_MANIFEST: __STATIC_CONTENT_MANIFEST,
        mapRequestToAsset: mapRequestToAsset,
        cacheControl: defaultCacheControl,
        defaultMimeType: 'text/plain',
        defaultDocument: 'index.html',
    }, options);
}
/**
 * maps the path of incoming request to the request pathKey to look up
 * in bucket and in cache
 * e.g.  for a path '/' returns '/index.html' which serves
 * the content of bucket/index.html
 * @param {Request} request incoming request
 */
var mapRequestToAsset = function (request, options) {
    options = assignOptions(options);
    var parsedUrl = new URL(request.url);
    var pathname = parsedUrl.pathname;
    if (pathname.endsWith('/')) {
        // If path looks like a directory append options.defaultDocument
        // e.g. If path is /about/ -> /about/index.html
        pathname = pathname.concat(options.defaultDocument);
    }
    else if (!mime.getType(pathname)) {
        // If path doesn't look like valid content
        //  e.g. /about.me ->  /about.me/index.html
        pathname = pathname.concat('/' + options.defaultDocument);
    }
    parsedUrl.pathname = pathname;
    return new Request(parsedUrl.toString(), request);
};
exports.mapRequestToAsset = mapRequestToAsset;
/**
 * maps the path of incoming request to /index.html if it evaluates to
 * any HTML file.
 * @param {Request} request incoming request
 */
function serveSinglePageApp(request, options) {
    options = assignOptions(options);
    // First apply the default handler, which already has logic to detect
    // paths that should map to HTML files.
    request = mapRequestToAsset(request);
    var parsedUrl = new URL(request.url);
    // Detect if the default handler decided to map to
    // a HTML file in some specific directory.
    if (parsedUrl.pathname.endsWith('.html')) {
        // If expected HTML file was missing, just return the root index.html (or options.defaultDocument)
        return new Request(parsedUrl.origin + "/" + options.defaultDocument, request);
    }
    else {
        // The default handler decided this is not an HTML page. It's probably
        // an image, CSS, or JS file. Leave it as-is.
        return request;
    }
}
exports.serveSinglePageApp = serveSinglePageApp;
/**
 * takes the path of the incoming request, gathers the appropriate content from KV, and returns
 * the response
 *
 * @param {FetchEvent} event the fetch event of the triggered request
 * @param {{mapRequestToAsset: (string: Request) => Request, cacheControl: {bypassCache:boolean, edgeTTL: number, browserTTL:number}, ASSET_NAMESPACE: any, ASSET_MANIFEST:any}} [options] configurable options
 * @param {CacheControl} [options.cacheControl] determine how to cache on Cloudflare and the browser
 * @param {typeof(options.mapRequestToAsset)} [options.mapRequestToAsset]  maps the path of incoming request to the request pathKey to look up
 * @param {Object | string} [options.ASSET_NAMESPACE] the binding to the namespace that script references
 * @param {any} [options.ASSET_MANIFEST] the map of the key to cache and store in KV
 * */
var getAssetFromKV = function (event, options) { return __awaiter(void 0, void 0, void 0, function () {
    var request, ASSET_NAMESPACE, ASSET_MANIFEST, SUPPORTED_METHODS, rawPathKey, pathIsEncoded, requestKey, parsedUrl, pathname, pathKey, cache, mimeType, shouldEdgeCache, cacheKey, evalCacheOpts, shouldSetBrowserCache, response, headers, shouldRevalidate, body;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                options = assignOptions(options);
                request = event.request;
                ASSET_NAMESPACE = options.ASSET_NAMESPACE;
                ASSET_MANIFEST = typeof (options.ASSET_MANIFEST) === 'string'
                    ? JSON.parse(options.ASSET_MANIFEST)
                    : options.ASSET_MANIFEST;
                if (typeof ASSET_NAMESPACE === 'undefined') {
                    throw new types_1.InternalError("there is no KV namespace bound to the script");
                }
                SUPPORTED_METHODS = ['GET', 'HEAD'];
                if (!SUPPORTED_METHODS.includes(request.method)) {
                    throw new types_1.MethodNotAllowedError(request.method + " is not a valid request method");
                }
                rawPathKey = new URL(request.url).pathname.replace(/^\/+/, '') // strip any preceding /'s
                ;
                pathIsEncoded = false;
                if (ASSET_MANIFEST[rawPathKey]) {
                    requestKey = request;
                }
                else if (ASSET_MANIFEST[decodeURIComponent(rawPathKey)]) {
                    pathIsEncoded = true;
                    requestKey = request;
                }
                else {
                    requestKey = options.mapRequestToAsset(request);
                }
                parsedUrl = new URL(requestKey.url);
                pathname = pathIsEncoded ? decodeURIComponent(parsedUrl.pathname) : parsedUrl.pathname // decode percentage encoded path only when necessary
                ;
                pathKey = pathname.replace(/^\/+/, '') // remove prepended /
                ;
                cache = caches.default;
                mimeType = mime.getType(pathKey) || options.defaultMimeType;
                if (mimeType.startsWith('text') || mimeType === 'application/javascript') {
                    mimeType += '; charset=utf-8';
                }
                shouldEdgeCache = false // false if storing in KV by raw file path i.e. no hash
                ;
                // check manifest for map from file path to hash
                if (typeof ASSET_MANIFEST !== 'undefined') {
                    if (ASSET_MANIFEST[pathKey]) {
                        pathKey = ASSET_MANIFEST[pathKey];
                        // if path key is in asset manifest, we can assume it contains a content hash and can be cached
                        shouldEdgeCache = true;
                    }
                }
                cacheKey = new Request(parsedUrl.origin + "/" + pathKey, request);
                evalCacheOpts = (function () {
                    switch (typeof options.cacheControl) {
                        case 'function':
                            return options.cacheControl(request);
                        case 'object':
                            return options.cacheControl;
                        default:
                            return defaultCacheControl;
                    }
                })();
                options.cacheControl = Object.assign({}, defaultCacheControl, evalCacheOpts);
                // override shouldEdgeCache if options say to bypassCache
                if (options.cacheControl.bypassCache ||
                    options.cacheControl.edgeTTL === null ||
                    request.method == 'HEAD') {
                    shouldEdgeCache = false;
                }
                shouldSetBrowserCache = typeof options.cacheControl.browserTTL === 'number';
                response = null;
                if (!shouldEdgeCache) return [3 /*break*/, 2];
                return [4 /*yield*/, cache.match(cacheKey)];
            case 1:
                response = _a.sent();
                _a.label = 2;
            case 2:
                if (!response) return [3 /*break*/, 3];
                headers = new Headers(response.headers);
                shouldRevalidate = false;
                // Four preconditions must be met for a 304 Not Modified:
                // - the request cannot be a range request
                // - client sends if-none-match
                // - resource has etag
                // - test if-none-match against the pathKey so that we test against KV, rather than against
                // CF cache, which may modify the etag with a weak validator (e.g. W/"...")
                shouldRevalidate = [
                    request.headers.has('range') !== true,
                    request.headers.has('if-none-match'),
                    response.headers.has('etag'),
                    request.headers.get('if-none-match') === "" + pathKey,
                ].every(Boolean);
                if (shouldRevalidate) {
                    // fixes issue #118
                    if (response.body && 'cancel' in Object.getPrototypeOf(response.body)) {
                        response.body.cancel();
                        console.log('Body exists and environment supports readable streams. Body cancelled');
                    }
                    else {
                        console.log('Environment doesnt support readable streams');
                    }
                    headers.set('cf-cache-status', 'REVALIDATED');
                    response = new Response(null, {
                        status: 304,
                        headers: headers,
                        statusText: 'Not Modified',
                    });
                }
                else {
                    headers.set('CF-Cache-Status', 'HIT');
                    response = new Response(response.body, { headers: headers });
                }
                return [3 /*break*/, 5];
            case 3: return [4 /*yield*/, ASSET_NAMESPACE.get(pathKey, 'arrayBuffer')];
            case 4:
                body = _a.sent();
                if (body === null) {
                    throw new types_1.NotFoundError("could not find " + pathKey + " in your content namespace");
                }
                response = new Response(body);
                if (shouldEdgeCache) {
                    response.headers.set('Accept-Ranges', 'bytes');
                    response.headers.set('Content-Length', body.length);
                    // set etag before cache insertion
                    if (!response.headers.has('etag')) {
                        response.headers.set('etag', "" + pathKey);
                    }
                    // determine Cloudflare cache behavior
                    response.headers.set('Cache-Control', "max-age=" + options.cacheControl.edgeTTL);
                    event.waitUntil(cache.put(cacheKey, response.clone()));
                    response.headers.set('CF-Cache-Status', 'MISS');
                }
                _a.label = 5;
            case 5:
                response.headers.set('Content-Type', mimeType);
                if (shouldSetBrowserCache) {
                    response.headers.set('Cache-Control', "max-age=" + options.cacheControl.browserTTL);
                }
                else {
                    response.headers.delete('Cache-Control');
                }
                return [2 /*return*/, response];
        }
    });
}); };
exports.getAssetFromKV = getAssetFromKV;

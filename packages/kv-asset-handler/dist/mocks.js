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
exports.sleep = exports.mockGlobal = exports.mockCaches = exports.mockManifest = exports.mockKV = exports.getEvent = void 0;
var makeServiceWorkerEnv = require('service-worker-mock');
var HASH = '123HASHBROWN';
exports.getEvent = function (request) {
    var waitUntil = function (callback) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, callback];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); };
    return {
        request: request,
        waitUntil: waitUntil,
    };
};
var store = {
    'key1.123HASHBROWN.txt': 'val1',
    'key1.123HASHBROWN.png': 'val1',
    'index.123HASHBROWN.html': 'index.html',
    'cache.123HASHBROWN.html': 'cache me if you can',
    '测试.123HASHBROWN.html': 'My filename is non-ascii',
    '%not-really-percent-encoded.123HASHBROWN.html': 'browser percent encoded',
    '%2F.123HASHBROWN.html': 'user percent encoded',
    '你好.123HASHBROWN.html': 'I shouldnt be served',
    '%E4%BD%A0%E5%A5%BD.123HASHBROWN.html': 'Im important',
    'nohash.txt': 'no hash but still got some result',
    'sub/blah.123HASHBROWN.png': 'picturedis',
    'sub/index.123HASHBROWN.html': 'picturedis',
    'client.123HASHBROWN': 'important file',
    'client.123HASHBROWN/index.html': 'Im here but serve my big bro above',
};
exports.mockKV = function (store) {
    return {
        get: function (path) { return store[path] || null; },
    };
};
exports.mockManifest = function () {
    return JSON.stringify({
        'key1.txt': "key1." + HASH + ".txt",
        'key1.png': "key1." + HASH + ".png",
        'cache.html': "cache." + HASH + ".html",
        '测试.html': "\u6D4B\u8BD5." + HASH + ".html",
        '你好.html': "\u4F60\u597D." + HASH + ".html",
        '%not-really-percent-encoded.html': "%not-really-percent-encoded." + HASH + ".html",
        '%2F.html': "%2F." + HASH + ".html",
        '%E4%BD%A0%E5%A5%BD.html': "%E4%BD%A0%E5%A5%BD." + HASH + ".html",
        'index.html': "index." + HASH + ".html",
        'sub/blah.png': "sub/blah." + HASH + ".png",
        'sub/index.html': "sub/index." + HASH + ".html",
        'client': "client." + HASH,
        'client/index.html': "client." + HASH,
    });
};
var cacheStore = new Map();
exports.mockCaches = function () {
    return {
        default: {
            match: function (key) {
                return __awaiter(this, void 0, void 0, function () {
                    var cacheKey, activeCacheKeys, _i, activeCacheKeys_1, cacheStoreKey;
                    return __generator(this, function (_a) {
                        cacheKey = {
                            url: key.url,
                            headers: {}
                        };
                        if (key.headers.has('if-none-match')) {
                            cacheKey.headers = {
                                'etag': key.headers.get('if-none-match')
                            };
                            return [2 /*return*/, cacheStore.get(JSON.stringify(cacheKey))];
                        }
                        activeCacheKeys = Array.from(cacheStore.keys());
                        for (_i = 0, activeCacheKeys_1 = activeCacheKeys; _i < activeCacheKeys_1.length; _i++) {
                            cacheStoreKey = activeCacheKeys_1[_i];
                            if (JSON.parse(cacheStoreKey).url === key.url) {
                                return [2 /*return*/, cacheStore.get(cacheStoreKey)];
                            }
                        }
                        return [2 /*return*/];
                    });
                });
            },
            put: function (key, val) {
                return __awaiter(this, void 0, void 0, function () {
                    var headers, resp, cacheKey;
                    return __generator(this, function (_a) {
                        headers = new Headers(val.headers);
                        resp = new Response(val.body, { headers: headers });
                        cacheKey = {
                            url: key.url,
                            headers: {
                                'etag': val.headers.get('etag')
                            }
                        };
                        return [2 /*return*/, cacheStore.set(JSON.stringify(cacheKey), resp)];
                    });
                });
            },
        },
    };
};
function mockGlobal() {
    Object.assign(global, makeServiceWorkerEnv());
    Object.assign(global, { __STATIC_CONTENT_MANIFEST: exports.mockManifest() });
    Object.assign(global, { __STATIC_CONTENT: exports.mockKV(store) });
    Object.assign(global, { caches: exports.mockCaches() });
}
exports.mockGlobal = mockGlobal;
exports.sleep = function (milliseconds) {
    return new Promise(function (resolve) { return setTimeout(resolve, milliseconds); });
};

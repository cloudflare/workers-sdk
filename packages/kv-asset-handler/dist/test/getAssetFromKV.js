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
var ava_1 = require("ava");
var mocks_1 = require("../mocks");
var index_1 = require("../index");
ava_1.default('getAssetFromKV return correct val from KV and default caching', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event, res, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                mocks_1.mockGlobal();
                event = mocks_1.getEvent(new Request('https://blah.com/key1.txt'));
                return [4 /*yield*/, index_1.getAssetFromKV(event)];
            case 1:
                res = _c.sent();
                if (!res) return [3 /*break*/, 3];
                t.is(res.headers.get('cache-control'), null);
                t.is(res.headers.get('cf-cache-status'), 'MISS');
                _b = (_a = t).is;
                return [4 /*yield*/, res.text()];
            case 2:
                _b.apply(_a, [_c.sent(), 'val1']);
                t.true(res.headers.get('content-type').includes('text'));
                return [3 /*break*/, 4];
            case 3:
                t.fail('Response was undefined');
                _c.label = 4;
            case 4: return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV evaluated the file matching the extensionless path first /client/ -> client', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event, res, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                mocks_1.mockGlobal();
                event = mocks_1.getEvent(new Request("https://foo.com/client/"));
                return [4 /*yield*/, index_1.getAssetFromKV(event)];
            case 1:
                res = _c.sent();
                _b = (_a = t).is;
                return [4 /*yield*/, res.text()];
            case 2:
                _b.apply(_a, [_c.sent(), 'important file']);
                t.true(res.headers.get('content-type').includes('text'));
                return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV evaluated the file matching the extensionless path first /client -> client', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event, res, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                mocks_1.mockGlobal();
                event = mocks_1.getEvent(new Request("https://foo.com/client"));
                return [4 /*yield*/, index_1.getAssetFromKV(event)];
            case 1:
                res = _c.sent();
                _b = (_a = t).is;
                return [4 /*yield*/, res.text()];
            case 2:
                _b.apply(_a, [_c.sent(), 'important file']);
                t.true(res.headers.get('content-type').includes('text'));
                return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV if not in asset manifest still returns nohash.txt', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event, res, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                mocks_1.mockGlobal();
                event = mocks_1.getEvent(new Request('https://blah.com/nohash.txt'));
                return [4 /*yield*/, index_1.getAssetFromKV(event)];
            case 1:
                res = _c.sent();
                if (!res) return [3 /*break*/, 3];
                _b = (_a = t).is;
                return [4 /*yield*/, res.text()];
            case 2:
                _b.apply(_a, [_c.sent(), 'no hash but still got some result']);
                t.true(res.headers.get('content-type').includes('text'));
                return [3 /*break*/, 4];
            case 3:
                t.fail('Response was undefined');
                _c.label = 4;
            case 4: return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV if no asset manifest /client -> client fails', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event, error;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mocks_1.mockGlobal();
                event = mocks_1.getEvent(new Request("https://foo.com/client"));
                return [4 /*yield*/, t.throwsAsync(index_1.getAssetFromKV(event, { ASSET_MANIFEST: {} }))];
            case 1:
                error = _a.sent();
                t.is(error.status, 404);
                return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV if sub/ -> sub/index.html served', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event, res, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                mocks_1.mockGlobal();
                event = mocks_1.getEvent(new Request("https://foo.com/sub"));
                return [4 /*yield*/, index_1.getAssetFromKV(event)];
            case 1:
                res = _c.sent();
                if (!res) return [3 /*break*/, 3];
                _b = (_a = t).is;
                return [4 /*yield*/, res.text()];
            case 2:
                _b.apply(_a, [_c.sent(), 'picturedis']);
                return [3 /*break*/, 4];
            case 3:
                t.fail('Response was undefined');
                _c.label = 4;
            case 4: return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV gets index.html by default for / requests', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event, res, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                mocks_1.mockGlobal();
                event = mocks_1.getEvent(new Request('https://blah.com/'));
                return [4 /*yield*/, index_1.getAssetFromKV(event)];
            case 1:
                res = _c.sent();
                if (!res) return [3 /*break*/, 3];
                _b = (_a = t).is;
                return [4 /*yield*/, res.text()];
            case 2:
                _b.apply(_a, [_c.sent(), 'index.html']);
                t.true(res.headers.get('content-type').includes('html'));
                return [3 /*break*/, 4];
            case 3:
                t.fail('Response was undefined');
                _c.label = 4;
            case 4: return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV non ASCII path support', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event, res, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                mocks_1.mockGlobal();
                event = mocks_1.getEvent(new Request('https://blah.com/测试.html'));
                return [4 /*yield*/, index_1.getAssetFromKV(event)];
            case 1:
                res = _c.sent();
                if (!res) return [3 /*break*/, 3];
                _b = (_a = t).is;
                return [4 /*yield*/, res.text()];
            case 2:
                _b.apply(_a, [_c.sent(), 'My filename is non-ascii']);
                return [3 /*break*/, 4];
            case 3:
                t.fail('Response was undefined');
                _c.label = 4;
            case 4: return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV supports browser percent encoded URLs', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event, res, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                mocks_1.mockGlobal();
                event = mocks_1.getEvent(new Request('https://example.com/%not-really-percent-encoded.html'));
                return [4 /*yield*/, index_1.getAssetFromKV(event)];
            case 1:
                res = _c.sent();
                if (!res) return [3 /*break*/, 3];
                _b = (_a = t).is;
                return [4 /*yield*/, res.text()];
            case 2:
                _b.apply(_a, [_c.sent(), 'browser percent encoded']);
                return [3 /*break*/, 4];
            case 3:
                t.fail('Response was undefined');
                _c.label = 4;
            case 4: return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV supports user percent encoded URLs', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event, res, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                mocks_1.mockGlobal();
                event = mocks_1.getEvent(new Request('https://blah.com/%2F.html'));
                return [4 /*yield*/, index_1.getAssetFromKV(event)];
            case 1:
                res = _c.sent();
                if (!res) return [3 /*break*/, 3];
                _b = (_a = t).is;
                return [4 /*yield*/, res.text()];
            case 2:
                _b.apply(_a, [_c.sent(), 'user percent encoded']);
                return [3 /*break*/, 4];
            case 3:
                t.fail('Response was undefined');
                _c.label = 4;
            case 4: return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV only decode URL when necessary', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event1, event2, res1, res2, _a, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                mocks_1.mockGlobal();
                event1 = mocks_1.getEvent(new Request('https://blah.com/%E4%BD%A0%E5%A5%BD.html'));
                event2 = mocks_1.getEvent(new Request('https://blah.com/你好.html'));
                return [4 /*yield*/, index_1.getAssetFromKV(event1)];
            case 1:
                res1 = _e.sent();
                return [4 /*yield*/, index_1.getAssetFromKV(event2)];
            case 2:
                res2 = _e.sent();
                if (!(res1 && res2)) return [3 /*break*/, 5];
                _b = (_a = t).is;
                return [4 /*yield*/, res1.text()];
            case 3:
                _b.apply(_a, [_e.sent(), 'Im important']);
                _d = (_c = t).is;
                return [4 /*yield*/, res2.text()];
            case 4:
                _d.apply(_c, [_e.sent(), 'Im important']);
                return [3 /*break*/, 6];
            case 5:
                t.fail('Response was undefined');
                _e.label = 6;
            case 6: return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV custom key modifier', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event, customRequestMapper, res, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                mocks_1.mockGlobal();
                event = mocks_1.getEvent(new Request('https://blah.com/docs/sub/blah.png'));
                customRequestMapper = function (request) {
                    var defaultModifiedRequest = index_1.mapRequestToAsset(request);
                    var url = new URL(defaultModifiedRequest.url);
                    url.pathname = url.pathname.replace('/docs', '');
                    return new Request(url.toString(), request);
                };
                return [4 /*yield*/, index_1.getAssetFromKV(event, { mapRequestToAsset: customRequestMapper })];
            case 1:
                res = _c.sent();
                if (!res) return [3 /*break*/, 3];
                _b = (_a = t).is;
                return [4 /*yield*/, res.text()];
            case 2:
                _b.apply(_a, [_c.sent(), 'picturedis']);
                return [3 /*break*/, 4];
            case 3:
                t.fail('Response was undefined');
                _c.label = 4;
            case 4: return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV when setting browser caching', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event, res;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mocks_1.mockGlobal();
                event = mocks_1.getEvent(new Request('https://blah.com/'));
                return [4 /*yield*/, index_1.getAssetFromKV(event, { cacheControl: { browserTTL: 22 } })];
            case 1:
                res = _a.sent();
                if (res) {
                    t.is(res.headers.get('cache-control'), 'max-age=22');
                }
                else {
                    t.fail('Response was undefined');
                }
                return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV when setting custom cache setting', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event1, event2, cacheOnlyPngs, res1, res2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mocks_1.mockGlobal();
                event1 = mocks_1.getEvent(new Request('https://blah.com/'));
                event2 = mocks_1.getEvent(new Request('https://blah.com/key1.png?blah=34'));
                cacheOnlyPngs = function (req) {
                    if (new URL(req.url).pathname.endsWith('.png'))
                        return {
                            browserTTL: 720,
                            edgeTTL: 720,
                        };
                    else
                        return {
                            bypassCache: true,
                        };
                };
                return [4 /*yield*/, index_1.getAssetFromKV(event1, { cacheControl: cacheOnlyPngs })];
            case 1:
                res1 = _a.sent();
                return [4 /*yield*/, index_1.getAssetFromKV(event2, { cacheControl: cacheOnlyPngs })];
            case 2:
                res2 = _a.sent();
                if (res1 && res2) {
                    t.is(res1.headers.get('cache-control'), null);
                    t.true(res2.headers.get('content-type').includes('png'));
                    t.is(res2.headers.get('cache-control'), 'max-age=720');
                    t.is(res2.headers.get('cf-cache-status'), 'MISS');
                }
                else {
                    t.fail('Response was undefined');
                }
                return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV caches on two sequential requests', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var resourceKey, resourceVersion, event1, event2, res1, res2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mocks_1.mockGlobal();
                resourceKey = 'cache.html';
                resourceVersion = JSON.parse(mocks_1.mockManifest())[resourceKey];
                event1 = mocks_1.getEvent(new Request("https://blah.com/" + resourceKey));
                event2 = mocks_1.getEvent(new Request("https://blah.com/" + resourceKey, {
                    headers: {
                        'if-none-match': resourceVersion
                    }
                }));
                return [4 /*yield*/, index_1.getAssetFromKV(event1, { cacheControl: { edgeTTL: 720, browserTTL: 720 } })];
            case 1:
                res1 = _a.sent();
                return [4 /*yield*/, mocks_1.sleep(1)];
            case 2:
                _a.sent();
                return [4 /*yield*/, index_1.getAssetFromKV(event2)];
            case 3:
                res2 = _a.sent();
                if (res1 && res2) {
                    t.is(res1.headers.get('cf-cache-status'), 'MISS');
                    t.is(res1.headers.get('cache-control'), 'max-age=720');
                    t.is(res2.headers.get('cf-cache-status'), 'REVALIDATED');
                }
                else {
                    t.fail('Response was undefined');
                }
                return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV does not store max-age on two sequential requests', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var resourceKey, resourceVersion, event1, event2, res1, res2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mocks_1.mockGlobal();
                resourceKey = 'cache.html';
                resourceVersion = JSON.parse(mocks_1.mockManifest())[resourceKey];
                event1 = mocks_1.getEvent(new Request("https://blah.com/" + resourceKey));
                event2 = mocks_1.getEvent(new Request("https://blah.com/" + resourceKey, {
                    headers: {
                        'if-none-match': resourceVersion
                    }
                }));
                return [4 /*yield*/, index_1.getAssetFromKV(event1, { cacheControl: { edgeTTL: 720 } })];
            case 1:
                res1 = _a.sent();
                return [4 /*yield*/, mocks_1.sleep(100)];
            case 2:
                _a.sent();
                return [4 /*yield*/, index_1.getAssetFromKV(event2)];
            case 3:
                res2 = _a.sent();
                if (res1 && res2) {
                    t.is(res1.headers.get('cf-cache-status'), 'MISS');
                    t.is(res1.headers.get('cache-control'), null);
                    t.is(res2.headers.get('cf-cache-status'), 'REVALIDATED');
                    t.is(res2.headers.get('cache-control'), null);
                }
                else {
                    t.fail('Response was undefined');
                }
                return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV does not cache on Cloudflare when bypass cache set', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event, res;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mocks_1.mockGlobal();
                event = mocks_1.getEvent(new Request('https://blah.com/'));
                return [4 /*yield*/, index_1.getAssetFromKV(event, { cacheControl: { bypassCache: true } })];
            case 1:
                res = _a.sent();
                if (res) {
                    t.is(res.headers.get('cache-control'), null);
                    t.is(res.headers.get('cf-cache-status'), null);
                }
                else {
                    t.fail('Response was undefined');
                }
                return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV with no trailing slash on root', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event, res, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                mocks_1.mockGlobal();
                event = mocks_1.getEvent(new Request('https://blah.com'));
                return [4 /*yield*/, index_1.getAssetFromKV(event)];
            case 1:
                res = _c.sent();
                if (!res) return [3 /*break*/, 3];
                _b = (_a = t).is;
                return [4 /*yield*/, res.text()];
            case 2:
                _b.apply(_a, [_c.sent(), 'index.html']);
                return [3 /*break*/, 4];
            case 3:
                t.fail('Response was undefined');
                _c.label = 4;
            case 4: return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV with no trailing slash on a subdirectory', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event, res, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                mocks_1.mockGlobal();
                event = mocks_1.getEvent(new Request('https://blah.com/sub/blah.png'));
                return [4 /*yield*/, index_1.getAssetFromKV(event)];
            case 1:
                res = _c.sent();
                if (!res) return [3 /*break*/, 3];
                _b = (_a = t).is;
                return [4 /*yield*/, res.text()];
            case 2:
                _b.apply(_a, [_c.sent(), 'picturedis']);
                return [3 /*break*/, 4];
            case 3:
                t.fail('Response was undefined');
                _c.label = 4;
            case 4: return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV no result throws an error', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event, error;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mocks_1.mockGlobal();
                event = mocks_1.getEvent(new Request('https://blah.com/random'));
                return [4 /*yield*/, t.throwsAsync(index_1.getAssetFromKV(event))];
            case 1:
                error = _a.sent();
                t.is(error.status, 404);
                return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV TTls set to null should not cache on browser or edge', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var event, res1, res2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mocks_1.mockGlobal();
                event = mocks_1.getEvent(new Request('https://blah.com/'));
                return [4 /*yield*/, index_1.getAssetFromKV(event, { cacheControl: { browserTTL: null, edgeTTL: null } })];
            case 1:
                res1 = _a.sent();
                return [4 /*yield*/, mocks_1.sleep(100)];
            case 2:
                _a.sent();
                return [4 /*yield*/, index_1.getAssetFromKV(event, { cacheControl: { browserTTL: null, edgeTTL: null } })];
            case 3:
                res2 = _a.sent();
                if (res1 && res2) {
                    t.is(res1.headers.get('cf-cache-status'), null);
                    t.is(res1.headers.get('cache-control'), null);
                    t.is(res2.headers.get('cf-cache-status'), null);
                    t.is(res2.headers.get('cache-control'), null);
                }
                else {
                    t.fail('Response was undefined');
                }
                return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV passing in a custom NAMESPACE serves correct asset', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var CUSTOM_NAMESPACE, event, res, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                mocks_1.mockGlobal();
                CUSTOM_NAMESPACE = mocks_1.mockKV({
                    'key1.123HASHBROWN.txt': 'val1',
                });
                Object.assign(global, { CUSTOM_NAMESPACE: CUSTOM_NAMESPACE });
                event = mocks_1.getEvent(new Request('https://blah.com/'));
                return [4 /*yield*/, index_1.getAssetFromKV(event)];
            case 1:
                res = _c.sent();
                if (!res) return [3 /*break*/, 3];
                _b = (_a = t).is;
                return [4 /*yield*/, res.text()];
            case 2:
                _b.apply(_a, [_c.sent(), 'index.html']);
                t.true(res.headers.get('content-type').includes('html'));
                return [3 /*break*/, 4];
            case 3:
                t.fail('Response was undefined');
                _c.label = 4;
            case 4: return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV when custom namespace without the asset should fail', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var CUSTOM_NAMESPACE, event, error;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mocks_1.mockGlobal();
                CUSTOM_NAMESPACE = mocks_1.mockKV({
                    'key5.123HASHBROWN.txt': 'customvalu',
                });
                event = mocks_1.getEvent(new Request('https://blah.com'));
                return [4 /*yield*/, t.throwsAsync(index_1.getAssetFromKV(event, { ASSET_NAMESPACE: CUSTOM_NAMESPACE }))];
            case 1:
                error = _a.sent();
                t.is(error.status, 404);
                return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV when namespace not bound fails', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var MY_CUSTOM_NAMESPACE, event, error;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mocks_1.mockGlobal();
                MY_CUSTOM_NAMESPACE = undefined;
                Object.assign(global, { MY_CUSTOM_NAMESPACE: MY_CUSTOM_NAMESPACE });
                event = mocks_1.getEvent(new Request('https://blah.com/'));
                return [4 /*yield*/, t.throwsAsync(index_1.getAssetFromKV(event, { ASSET_NAMESPACE: MY_CUSTOM_NAMESPACE }))];
            case 1:
                error = _a.sent();
                t.is(error.status, 500);
                return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV when if-none-match === etag and etag === pathKey in manifest, should revalidate', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var resourceKey, resourceVersion, event1, event2, res1, res2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mocks_1.mockGlobal();
                resourceKey = 'key1.png';
                resourceVersion = JSON.parse(mocks_1.mockManifest())[resourceKey];
                event1 = mocks_1.getEvent(new Request("https://blah.com/" + resourceKey));
                event2 = mocks_1.getEvent(new Request("https://blah.com/" + resourceKey, {
                    headers: {
                        'if-none-match': resourceVersion
                    }
                }));
                return [4 /*yield*/, index_1.getAssetFromKV(event1, { cacheControl: { edgeTTL: 720 } })];
            case 1:
                res1 = _a.sent();
                return [4 /*yield*/, mocks_1.sleep(100)];
            case 2:
                _a.sent();
                return [4 /*yield*/, index_1.getAssetFromKV(event2)];
            case 3:
                res2 = _a.sent();
                if (res1 && res2) {
                    t.is(res1.headers.get('cf-cache-status'), 'MISS');
                    t.is(res2.headers.get('etag'), resourceVersion);
                    t.is(res2.status, 304);
                }
                else {
                    t.fail('Response was undefined');
                }
                return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV when etag and if-none-match are present but if-none-match !== etag, should bypass cache', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var resourceKey, resourceVersion, req1, req2, event, event2, res1, res2, res3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mocks_1.mockGlobal();
                resourceKey = 'key1.png';
                resourceVersion = JSON.parse(mocks_1.mockManifest())[resourceKey];
                req1 = new Request("https://blah.com/" + resourceKey, {
                    headers: {
                        'if-none-match': resourceVersion
                    }
                });
                req2 = new Request("https://blah.com/" + resourceKey, {
                    headers: {
                        'if-none-match': resourceVersion + "another-version"
                    }
                });
                event = mocks_1.getEvent(req1);
                event2 = mocks_1.getEvent(req2);
                return [4 /*yield*/, index_1.getAssetFromKV(event, { cacheControl: { edgeTTL: 720 } })];
            case 1:
                res1 = _a.sent();
                return [4 /*yield*/, index_1.getAssetFromKV(event)];
            case 2:
                res2 = _a.sent();
                return [4 /*yield*/, index_1.getAssetFromKV(event2)];
            case 3:
                res3 = _a.sent();
                if (res1 && res2 && res3) {
                    t.is(res1.headers.get('cf-cache-status'), 'MISS');
                    t.is(res2.headers.get('etag'), req1.headers.get('if-none-match'));
                    t.true(req2.headers.has('if-none-match'));
                    t.not(res3.headers.get('etag'), req2.headers.get('if-none-match'));
                    t.is(res3.headers.get('cf-cache-status'), 'MISS');
                }
                else {
                    t.fail('Response was undefined');
                }
                return [2 /*return*/];
        }
    });
}); });
ava_1.default('getAssetFromKV if-none-match not sent but resource in cache, should return hit', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var resourceKey, event, res1, res2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                resourceKey = 'cache.html';
                event = mocks_1.getEvent(new Request("https://blah.com/" + resourceKey));
                return [4 /*yield*/, index_1.getAssetFromKV(event, { cacheControl: { edgeTTL: 720 } })];
            case 1:
                res1 = _a.sent();
                return [4 /*yield*/, mocks_1.sleep(1)];
            case 2:
                _a.sent();
                return [4 /*yield*/, index_1.getAssetFromKV(event)];
            case 3:
                res2 = _a.sent();
                if (res1 && res2) {
                    t.is(res1.headers.get('cf-cache-status'), 'MISS');
                    t.is(res1.headers.get('cache-control'), null);
                    t.is(res2.headers.get('cf-cache-status'), 'HIT');
                }
                else {
                    t.fail('Response was undefined');
                }
                return [2 /*return*/];
        }
    });
}); });
ava_1.default.todo('getAssetFromKV when body not empty, should invoke .cancel()');

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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
exports.__esModule = true;
var handler_1 = require("../../asset-server/handler");
var createMetadataObject_1 = require("../../metadata-generator/createMetadataObject");
describe("asset-server handler", function () {
    test("Returns appropriate status codes", function () { return __awaiter(void 0, void 0, void 0, function () {
        var statuses, metadata, tests, response, proxyResponse;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    statuses = [301, 302, 303, 307, 308];
                    metadata = createMetadataObjectWithRedirects(statuses
                        .map(function (status) { return ({
                        status: status,
                        from: "/".concat(status),
                        to: "/home"
                    }); })
                        .concat({
                        status: 302,
                        from: "/500",
                        to: "/home"
                    }, {
                        status: 200,
                        from: "/200",
                        to: "/proxied-file"
                    }));
                    tests = statuses.map(function (status) { return __awaiter(void 0, void 0, void 0, function () {
                        var response;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, getTestResponse({
                                        request: "https://foo.com/" + status,
                                        metadata: metadata
                                    })];
                                case 1:
                                    response = (_a.sent()).response;
                                    expect(response.status).toBe(status);
                                    expect(response.headers.get("Location")).toBe("/home");
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                    return [4 /*yield*/, Promise.all(tests)];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, getTestResponse({
                            request: "https://foo.com/500",
                            metadata: metadata
                        })];
                case 2:
                    response = (_a.sent()).response;
                    expect(response.status).toBe(302);
                    expect(response.headers.get("Location")).toBe("/home");
                    return [4 /*yield*/, getTestResponse({
                            request: "https://foo.com/200",
                            metadata: metadata,
                            findAssetEntryForPath: function (path) { return __awaiter(void 0, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    if (path === "/proxied-file.html") {
                                        return [2 /*return*/, "proxied file"];
                                    }
                                    return [2 /*return*/, null];
                                });
                            }); }
                        })];
                case 3:
                    proxyResponse = (_a.sent()).response;
                    expect(proxyResponse.status).toBe(200);
                    expect(proxyResponse.headers.get("Location")).toBeNull();
                    return [2 /*return*/];
            }
        });
    }); });
    test("Won't redirect to protocol-less double-slashed URLs", function () { return __awaiter(void 0, void 0, void 0, function () {
        var metadata, findAssetEntryForPath, response, response, response, response, response, response, response, response;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    metadata = createMetadataObjectWithRedirects([
                        { from: "/", to: "/home", status: 301 },
                        { from: "/page.html", to: "/elsewhere", status: 301 },
                    ]);
                    findAssetEntryForPath = function (path) { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            if (path === "/index.html") {
                                return [2 /*return*/, "index page"];
                            }
                            if (path === "/page.html") {
                                return [2 /*return*/, "some page"];
                            }
                            return [2 /*return*/, null];
                        });
                    }); };
                    return [4 /*yield*/, getTestResponse({
                            request: "/%2Fwww.example.com/index/",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 1:
                    response = (_a.sent()).response;
                    expect(response.status).toBe(308);
                    expect(response.headers.get("Location")).toEqual("/www.example.com/");
                    return [4 /*yield*/, getTestResponse({
                            request: "/%5Cwww.example.com/index/",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 2:
                    response = (_a.sent()).response;
                    expect(response.status).toBe(308);
                    expect(response.headers.get("Location")).toEqual("/www.example.com/");
                    return [4 /*yield*/, getTestResponse({
                            request: "/%2Fwww.example.com/%2F/index/",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 3:
                    response = (_a.sent()).response;
                    expect(response.status).toBe(308);
                    expect(response.headers.get("Location")).toEqual("/www.example.com///");
                    return [4 /*yield*/, getTestResponse({
                            request: "/%09/www.example.com/%09/index/",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 4:
                    response = (_a.sent()).response;
                    expect(response.status).toBe(308);
                    expect(response.headers.get("Location")).toEqual("/www.example.com/	/");
                    return [4 /*yield*/, getTestResponse({
                            request: "/%5Cwww.example.com/%5C/index/",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 5:
                    response = (_a.sent()).response;
                    expect(response.status).toBe(308);
                    expect(response.headers.get("Location")).toEqual("/www.example.com/\\/");
                    return [4 /*yield*/, getTestResponse({
                            request: "/%2fwww.example.com/%2f/index/",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 6:
                    response = (_a.sent()).response;
                    expect(response.status).toBe(308);
                    expect(response.headers.get("Location")).toEqual("/www.example.com///");
                    return [4 /*yield*/, getTestResponse({
                            request: "/%5cwww.example.com/%5c/index/",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 7:
                    response = (_a.sent()).response;
                    expect(response.status).toBe(308);
                    expect(response.headers.get("Location")).toEqual("/www.example.com/\\/");
                    return [4 /*yield*/, getTestResponse({
                            request: "/foo/index/",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 8:
                    response = (_a.sent()).response;
                    expect(response.status).toBe(308);
                    expect(response.headers.get("Location")).toEqual("/foo/");
                    return [2 /*return*/];
            }
        });
    }); });
    test("Match exact pathnames, before any HTML redirection", function () { return __awaiter(void 0, void 0, void 0, function () {
        var metadata, findAssetEntryForPath, response, response, response, response, response, _a, response, spies;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    metadata = createMetadataObjectWithRedirects([
                        { from: "/", to: "/home", status: 301 },
                        { from: "/page.html", to: "/elsewhere", status: 301 },
                        { from: "/protocol-less-test", to: "/%2fwww.example.com/", status: 308 },
                    ]);
                    findAssetEntryForPath = function (path) { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            if (path === "/index.html") {
                                return [2 /*return*/, "index page"];
                            }
                            if (path === "/page.html") {
                                return [2 /*return*/, "some page"];
                            }
                            return [2 /*return*/, null];
                        });
                    }); };
                    return [4 /*yield*/, getTestResponse({
                            request: "/index.html",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 1:
                    response = (_b.sent()).response;
                    expect(response.status).toBe(308);
                    expect(response.headers.get("Location")).toEqual("/");
                    return [4 /*yield*/, getTestResponse({
                            request: "/index",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 2:
                    response = (_b.sent()).response;
                    expect(response.status).toBe(308);
                    expect(response.headers.get("Location")).toEqual("/");
                    return [4 /*yield*/, getTestResponse({
                            request: "/",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 3:
                    response = (_b.sent()).response;
                    expect(response.status).toBe(301);
                    expect(response.headers.get("Location")).toEqual("/home");
                    return [4 /*yield*/, getTestResponse({
                            request: "/page.html",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 4:
                    response = (_b.sent()).response;
                    expect(response.status).toBe(301);
                    expect(response.headers.get("Location")).toEqual("/elsewhere");
                    return [4 /*yield*/, getTestResponse({
                            request: "/protocol-less-test",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 5:
                    response = (_b.sent()).response;
                    expect(response.status).toBe(308);
                    expect(response.headers.get("Location")).toEqual("/%2fwww.example.com/");
                    return [4 /*yield*/, getTestResponse({
                            request: "/page",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 6:
                    _a = _b.sent(), response = _a.response, spies = _a.spies;
                    expect(response.status).toBe(200);
                    expect(spies.fetchAsset).toBe(1);
                    return [2 /*return*/];
            }
        });
    }); });
    test("cross-host static redirects still are executed with line number precedence", function () { return __awaiter(void 0, void 0, void 0, function () {
        var metadata, findAssetEntryForPath, response, response;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    metadata = createMetadataObjectWithRedirects([
                        { from: "https://fakehost/home", to: "https://firsthost/", status: 302 },
                        { from: "/home", to: "https://secondhost/", status: 302 },
                    ]);
                    findAssetEntryForPath = function (path) { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            if (path === "/index.html") {
                                return [2 /*return*/, "index page"];
                            }
                            return [2 /*return*/, null];
                        });
                    }); };
                    return [4 /*yield*/, getTestResponse({
                            request: "https://yetanotherhost/home",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 1:
                    response = (_a.sent()).response;
                    expect(response.status).toBe(302);
                    expect(response.headers.get("Location")).toEqual("https://secondhost/");
                    return [4 /*yield*/, getTestResponse({
                            request: "https://fakehost/home",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 2:
                    response = (_a.sent()).response;
                    expect(response.status).toBe(302);
                    expect(response.headers.get("Location")).toEqual("https://firsthost/");
                    return [2 /*return*/];
            }
        });
    }); });
    test("it should preserve querystrings unless to rule includes them", function () { return __awaiter(void 0, void 0, void 0, function () {
        var metadata, findAssetEntryForPath, response, response, response;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    metadata = createMetadataObjectWithRedirects([
                        { from: "/", status: 301, to: "/home" },
                        { from: "/recent", status: 301, to: "/home?sort=updated_at" },
                    ]);
                    findAssetEntryForPath = function (path) { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            if (path === "/home.html") {
                                return [2 /*return*/, "home page"];
                            }
                            return [2 /*return*/, null];
                        });
                    }); };
                    return [4 /*yield*/, getTestResponse({
                            request: "/?sort=price",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 1:
                    response = (_a.sent()).response;
                    expect(response.status).toBe(301);
                    expect(response.headers.get("Location")).toEqual("/home?sort=price");
                    return [4 /*yield*/, getTestResponse({
                            request: "/recent",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 2:
                    response = (_a.sent()).response;
                    expect(response.status).toBe(301);
                    expect(response.headers.get("Location")).toEqual("/home?sort=updated_at");
                    return [4 /*yield*/, getTestResponse({
                            request: "/recent?other=query",
                            metadata: metadata,
                            findAssetEntryForPath: findAssetEntryForPath
                        })];
                case 3:
                    response = (_a.sent()).response;
                    expect(response.status).toBe(301);
                    expect(response.headers.get("Location")).toEqual("/home?sort=updated_at");
                    return [2 /*return*/];
            }
        });
    }); });
    {
        var metadata_1 = createMetadataObjectWithRedirects([
            { from: "/home", status: 301, to: "/" },
            { from: "/blog/*", status: 301, to: "https://blog.example.com/:splat" },
            {
                from: "/products/:code/:name/*",
                status: 301,
                to: "/products?junk=:splat&name=:name&code=:code"
            },
            { from: "/foo", status: 301, to: "/bar" },
        ]);
        var findAssetEntryForPath_1 = function (path) { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (path === "/home.html") {
                    return [2 /*return*/, "home page"];
                }
                return [2 /*return*/, null];
            });
        }); };
        test("it should perform splat replacements", function () { return __awaiter(void 0, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, getTestResponse({
                            request: "/blog/a-blog-posting",
                            metadata: metadata_1,
                            findAssetEntryForPath: findAssetEntryForPath_1
                        })];
                    case 1:
                        response = (_a.sent()).response;
                        expect(response.status).toBe(301);
                        expect(response.headers.get("Location")).toEqual("https://blog.example.com/a-blog-posting");
                        return [2 /*return*/];
                }
            });
        }); });
        test("it should perform placeholder replacements", function () { return __awaiter(void 0, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, getTestResponse({
                            request: "/products/abba_562/tricycle/123abc@~!",
                            metadata: metadata_1,
                            findAssetEntryForPath: findAssetEntryForPath_1
                        })];
                    case 1:
                        response = (_a.sent()).response;
                        expect(response.status).toBe(301);
                        expect(response.headers.get("Location")).toEqual("/products?junk=123abc@~!&name=tricycle&code=abba_562");
                        return [2 /*return*/];
                }
            });
        }); });
        test("it should redirect both dynamic and static redirects", function () { return __awaiter(void 0, void 0, void 0, function () {
            var response, response, response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, getTestResponse({
                            request: "/home",
                            metadata: metadata_1,
                            findAssetEntryForPath: findAssetEntryForPath_1
                        })];
                    case 1:
                        response = (_a.sent()).response;
                        expect(response.status).toBe(301);
                        expect(response.headers.get("Location")).toEqual("/");
                        return [4 /*yield*/, getTestResponse({
                                request: "/blog/post",
                                metadata: metadata_1,
                                findAssetEntryForPath: findAssetEntryForPath_1
                            })];
                    case 2:
                        response = (_a.sent()).response;
                        expect(response.status).toBe(301);
                        expect(response.headers.get("Location")).toEqual("https://blog.example.com/post");
                        return [4 /*yield*/, getTestResponse({
                                request: "/foo",
                                metadata: metadata_1,
                                findAssetEntryForPath: findAssetEntryForPath_1
                            })];
                    case 3:
                        response = (_a.sent()).response;
                        expect(response.status).toBe(301);
                        expect(response.headers.get("Location")).toEqual("/bar");
                        return [2 /*return*/];
                }
            });
        }); });
    }
    // test("Returns a redirect without duplicating the hash component", async () => {
    // 	const { response, spies } = await getTestResponse({
    // 		request: "https://foo.com/bar",
    // 		metadata: createMetadataObjectWithRedirects([
    // 			{ from: "/bar", to: "https://foobar.com/##heading-7", status: 301 },
    // 		]),
    // 	});
    // 	expect(spies.fetchAsset).toBe(0);
    // 	expect(spies.findAssetEntryForPath).toBe(0);
    // 	expect(spies.getAssetKey).toBe(0);
    // 	expect(spies.negotiateContent).toBe(0);
    // 	expect(response.status).toBe(301);
    // 	expect(response.headers.get("Location")).toBe(
    // 		"https://foobar.com/##heading-7"
    // 	);
    // });
    test("it should redirect uri-encoded paths", function () { return __awaiter(void 0, void 0, void 0, function () {
        var _a, response, spies;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, getTestResponse({
                        request: "https://foo.com/some%20page",
                        metadata: createMetadataObjectWithRedirects([
                            { from: "/some%20page", to: "/home", status: 301 },
                        ])
                    })];
                case 1:
                    _a = _b.sent(), response = _a.response, spies = _a.spies;
                    expect(spies.fetchAsset).toBe(0);
                    expect(spies.findAssetEntryForPath).toBe(0);
                    expect(spies.getAssetKey).toBe(0);
                    expect(spies.negotiateContent).toBe(0);
                    expect(response.status).toBe(301);
                    expect(response.headers.get("Location")).toBe("/home");
                    return [2 /*return*/];
            }
        });
    }); });
    // 	test("getResponseFromMatch - same origin paths specified as root-relative", () => {
    // 		const res = getResponseFromMatch(
    // 			{
    // 				to: "/bar",
    // 				status: 301,
    // 			},
    // 			new URL("https://example.com/foo")
    // 		);
    // 		expect(res.status).toBe(301);
    // 		expect(res.headers.get("Location")).toBe("/bar");
    // 	});
    // 	test("getResponseFromMatch - same origin paths specified as full URLs", () => {
    // 		const res = getResponseFromMatch(
    // 			{
    // 				to: "https://example.com/bar",
    // 				status: 301,
    // 			},
    // 			new URL("https://example.com/foo")
    // 		);
    // 		expect(res.status).toBe(301);
    // 		expect(res.headers.get("Location")).toBe("/bar");
    // 	});
    // });
    // test("getResponseFromMatch - different origins", () => {
    // 	const res = getResponseFromMatch(
    // 		{
    // 			to: "https://bar.com/bar",
    // 			status: 302,
    // 		},
    // 		new URL("https://example.com/foo")
    // 	);
    // 	expect(res.status).toBe(302);
    // 	expect(res.headers.get("Location")).toBe("https://bar.com/bar");
});
function getTestResponse(_a) {
    var request = _a.request, _b = _a.metadata, metadata = _b === void 0 ? (0, createMetadataObject_1.createMetadataObject)({
        redirects: {
            invalid: [],
            rules: []
        }
    }) : _b, options = __rest(_a, ["request", "metadata"]);
    return __awaiter(this, void 0, void 0, function () {
        var spies, response;
        var _this = this;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    spies = {
                        fetchAsset: 0,
                        findAssetEntryForPath: 0,
                        getAssetKey: 0,
                        negotiateContent: 0
                    };
                    return [4 /*yield*/, (0, handler_1.generateHandler)({
                            request: request instanceof Request ? request : new Request(request),
                            metadata: metadata,
                            xServerEnvHeader: "dev",
                            logError: console.error,
                            findAssetEntryForPath: function () {
                                var args = [];
                                for (var _i = 0; _i < arguments.length; _i++) {
                                    args[_i] = arguments[_i];
                                }
                                return __awaiter(_this, void 0, void 0, function () {
                                    var _a, _b;
                                    return __generator(this, function (_c) {
                                        spies.findAssetEntryForPath++;
                                        return [2 /*return*/, (_b = (_a = options.findAssetEntryForPath) === null || _a === void 0 ? void 0 : _a.call.apply(_a, __spreadArray([options], args, false))) !== null && _b !== void 0 ? _b : null];
                                    });
                                });
                            },
                            getAssetKey: function (assetEntry, content) {
                                var _a, _b;
                                spies.getAssetKey++;
                                return (_b = (_a = options.getAssetKey) === null || _a === void 0 ? void 0 : _a.call(options, assetEntry, content)) !== null && _b !== void 0 ? _b : assetEntry;
                            },
                            negotiateContent: function () {
                                var _a, _b;
                                var args = [];
                                for (var _i = 0; _i < arguments.length; _i++) {
                                    args[_i] = arguments[_i];
                                }
                                spies.negotiateContent++;
                                return (_b = (_a = options.negotiateContent) === null || _a === void 0 ? void 0 : _a.call.apply(_a, __spreadArray([options], args, false))) !== null && _b !== void 0 ? _b : { encoding: null };
                            },
                            fetchAsset: function () {
                                var args = [];
                                for (var _i = 0; _i < arguments.length; _i++) {
                                    args[_i] = arguments[_i];
                                }
                                return __awaiter(_this, void 0, void 0, function () {
                                    var _a, _b;
                                    return __generator(this, function (_c) {
                                        spies.fetchAsset++;
                                        return [2 /*return*/, ((_b = (_a = options.fetchAsset) === null || _a === void 0 ? void 0 : _a.call.apply(_a, __spreadArray([options], args, false))) !== null && _b !== void 0 ? _b : {
                                                body: null,
                                                contentType: "text/plain"
                                            })];
                                    });
                                });
                            }
                        })];
                case 1:
                    response = _c.sent();
                    return [2 /*return*/, { response: response, spies: spies }];
            }
        });
    });
}
function createMetadataObjectWithRedirects(rules) {
    return (0, createMetadataObject_1.createMetadataObject)({
        redirects: {
            invalid: [],
            rules: rules.map(function (rule, i) { return (__assign(__assign({}, rule), { lineNumber: i + 1 })); })
        }
    });
}

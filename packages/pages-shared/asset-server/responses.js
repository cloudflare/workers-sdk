"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.TemporaryRedirectResponse = exports.SeeOtherResponse = exports.InternalServerErrorResponse = exports.NotAcceptableResponse = exports.MethodNotAllowedResponse = exports.NotFoundResponse = exports.PermanentRedirectResponse = exports.NotModifiedResponse = exports.FoundResponse = exports.MovedPermanentlyResponse = exports.OkResponse = exports.stripLeadingDoubleSlashes = void 0;
function mergeHeaders(base, extra) {
    var baseHeaders = new Headers(base !== null && base !== void 0 ? base : {});
    var extraHeaders = new Headers(extra !== null && extra !== void 0 ? extra : {});
    return new Headers(__assign(__assign({}, Object.fromEntries(baseHeaders.entries())), Object.fromEntries(extraHeaders.entries())));
}
function stripLeadingDoubleSlashes(location) {
    return location.replace(/^(\/|%2F|%2f|%5C|%5c|%09|\s|\\)+(.*)/, "/$2");
}
exports.stripLeadingDoubleSlashes = stripLeadingDoubleSlashes;
var OkResponse = /** @class */ (function (_super) {
    __extends(OkResponse, _super);
    function OkResponse() {
        var _a = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            _a[_i] = arguments[_i];
        }
        var body = _a[0], init = _a[1];
        return _super.call(this, body, __assign(__assign({}, init), { status: 200, statusText: "OK" })) || this;
    }
    return OkResponse;
}(Response));
exports.OkResponse = OkResponse;
var MovedPermanentlyResponse = /** @class */ (function (_super) {
    __extends(MovedPermanentlyResponse, _super);
    function MovedPermanentlyResponse(location, init, _a) {
        var _b = _a === void 0 ? {
            preventLeadingDoubleSlash: true
        } : _a, _c = _b.preventLeadingDoubleSlash, preventLeadingDoubleSlash = _c === void 0 ? true : _c;
        location = preventLeadingDoubleSlash
            ? stripLeadingDoubleSlashes(location)
            : location;
        return _super.call(this, "Redirecting to ".concat(location), __assign(__assign({}, init), { status: 301, statusText: "Moved Permanently", headers: mergeHeaders(init === null || init === void 0 ? void 0 : init.headers, {
                location: location
            }) })) || this;
    }
    return MovedPermanentlyResponse;
}(Response));
exports.MovedPermanentlyResponse = MovedPermanentlyResponse;
var FoundResponse = /** @class */ (function (_super) {
    __extends(FoundResponse, _super);
    function FoundResponse(location, init, _a) {
        var _b = _a === void 0 ? {
            preventLeadingDoubleSlash: true
        } : _a, _c = _b.preventLeadingDoubleSlash, preventLeadingDoubleSlash = _c === void 0 ? true : _c;
        location = preventLeadingDoubleSlash
            ? stripLeadingDoubleSlashes(location)
            : location;
        return _super.call(this, "Redirecting to ".concat(location), __assign(__assign({}, init), { status: 302, statusText: "Found", headers: mergeHeaders(init === null || init === void 0 ? void 0 : init.headers, {
                location: location
            }) })) || this;
    }
    return FoundResponse;
}(Response));
exports.FoundResponse = FoundResponse;
var NotModifiedResponse = /** @class */ (function (_super) {
    __extends(NotModifiedResponse, _super);
    function NotModifiedResponse() {
        var _a = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            _a[_i] = arguments[_i];
        }
        var _body = _a[0], _init = _a[1];
        return _super.call(this, undefined, {
            status: 304,
            statusText: "Not Modified"
        }) || this;
    }
    return NotModifiedResponse;
}(Response));
exports.NotModifiedResponse = NotModifiedResponse;
var PermanentRedirectResponse = /** @class */ (function (_super) {
    __extends(PermanentRedirectResponse, _super);
    function PermanentRedirectResponse(location, init, _a) {
        var _b = _a === void 0 ? {
            preventLeadingDoubleSlash: true
        } : _a, _c = _b.preventLeadingDoubleSlash, preventLeadingDoubleSlash = _c === void 0 ? true : _c;
        location = preventLeadingDoubleSlash
            ? stripLeadingDoubleSlashes(location)
            : location;
        return _super.call(this, undefined, __assign(__assign({}, init), { status: 308, statusText: "Permanent Redirect", headers: mergeHeaders(init === null || init === void 0 ? void 0 : init.headers, {
                location: location
            }) })) || this;
    }
    return PermanentRedirectResponse;
}(Response));
exports.PermanentRedirectResponse = PermanentRedirectResponse;
var NotFoundResponse = /** @class */ (function (_super) {
    __extends(NotFoundResponse, _super);
    function NotFoundResponse() {
        var _a = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            _a[_i] = arguments[_i];
        }
        var body = _a[0], init = _a[1];
        return _super.call(this, body, __assign(__assign({}, init), { status: 404, statusText: "Not Found" })) || this;
    }
    return NotFoundResponse;
}(Response));
exports.NotFoundResponse = NotFoundResponse;
var MethodNotAllowedResponse = /** @class */ (function (_super) {
    __extends(MethodNotAllowedResponse, _super);
    function MethodNotAllowedResponse() {
        var _a = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            _a[_i] = arguments[_i];
        }
        var body = _a[0], init = _a[1];
        return _super.call(this, body, __assign(__assign({}, init), { status: 405, statusText: "Method Not Allowed" })) || this;
    }
    return MethodNotAllowedResponse;
}(Response));
exports.MethodNotAllowedResponse = MethodNotAllowedResponse;
var NotAcceptableResponse = /** @class */ (function (_super) {
    __extends(NotAcceptableResponse, _super);
    function NotAcceptableResponse() {
        var _a = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            _a[_i] = arguments[_i];
        }
        var body = _a[0], init = _a[1];
        return _super.call(this, body, __assign(__assign({}, init), { status: 406, statusText: "Not Acceptable" })) || this;
    }
    return NotAcceptableResponse;
}(Response));
exports.NotAcceptableResponse = NotAcceptableResponse;
var InternalServerErrorResponse = /** @class */ (function (_super) {
    __extends(InternalServerErrorResponse, _super);
    function InternalServerErrorResponse(err, init) {
        var body = undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (globalThis.DEBUG) {
            body = "".concat(err.message, "\n\n").concat(err.stack);
        }
        return _super.call(this, body, __assign(__assign({}, init), { status: 500, statusText: "Internal Server Error" })) || this;
    }
    return InternalServerErrorResponse;
}(Response));
exports.InternalServerErrorResponse = InternalServerErrorResponse;
var SeeOtherResponse = /** @class */ (function (_super) {
    __extends(SeeOtherResponse, _super);
    function SeeOtherResponse(location, init, _a) {
        var _b = _a === void 0 ? {
            preventLeadingDoubleSlash: true
        } : _a, _c = _b.preventLeadingDoubleSlash, preventLeadingDoubleSlash = _c === void 0 ? true : _c;
        location = preventLeadingDoubleSlash
            ? stripLeadingDoubleSlashes(location)
            : location;
        return _super.call(this, "Redirecting to ".concat(location), __assign(__assign({}, init), { status: 303, statusText: "See Other", headers: mergeHeaders(init === null || init === void 0 ? void 0 : init.headers, { location: location }) })) || this;
    }
    return SeeOtherResponse;
}(Response));
exports.SeeOtherResponse = SeeOtherResponse;
var TemporaryRedirectResponse = /** @class */ (function (_super) {
    __extends(TemporaryRedirectResponse, _super);
    function TemporaryRedirectResponse(location, init, _a) {
        var _b = _a === void 0 ? {
            preventLeadingDoubleSlash: true
        } : _a, _c = _b.preventLeadingDoubleSlash, preventLeadingDoubleSlash = _c === void 0 ? true : _c;
        location = preventLeadingDoubleSlash
            ? stripLeadingDoubleSlashes(location)
            : location;
        return _super.call(this, "Redirecting to ".concat(location), __assign(__assign({}, init), { status: 307, statusText: "Temporary Redirect", headers: mergeHeaders(init === null || init === void 0 ? void 0 : init.headers, { location: location }) })) || this;
    }
    return TemporaryRedirectResponse;
}(Response));
exports.TemporaryRedirectResponse = TemporaryRedirectResponse;

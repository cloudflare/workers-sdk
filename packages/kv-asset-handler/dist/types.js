"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalError = exports.NotFoundError = exports.MethodNotAllowedError = exports.KVError = void 0;
var KVError = /** @class */ (function (_super) {
    __extends(KVError, _super);
    function KVError(message, status) {
        var _newTarget = this.constructor;
        if (status === void 0) { status = 500; }
        var _this = _super.call(this, message) || this;
        // see: typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html
        Object.setPrototypeOf(_this, _newTarget.prototype); // restore prototype chain
        _this.name = KVError.name; // stack traces display correctly now
        _this.status = status;
        return _this;
    }
    return KVError;
}(Error));
exports.KVError = KVError;
var MethodNotAllowedError = /** @class */ (function (_super) {
    __extends(MethodNotAllowedError, _super);
    function MethodNotAllowedError(message, status) {
        if (message === void 0) { message = "Not a valid request method"; }
        if (status === void 0) { status = 405; }
        return _super.call(this, message, status) || this;
    }
    return MethodNotAllowedError;
}(KVError));
exports.MethodNotAllowedError = MethodNotAllowedError;
var NotFoundError = /** @class */ (function (_super) {
    __extends(NotFoundError, _super);
    function NotFoundError(message, status) {
        if (message === void 0) { message = "Not Found"; }
        if (status === void 0) { status = 404; }
        return _super.call(this, message, status) || this;
    }
    return NotFoundError;
}(KVError));
exports.NotFoundError = NotFoundError;
var InternalError = /** @class */ (function (_super) {
    __extends(InternalError, _super);
    function InternalError(message, status) {
        if (message === void 0) { message = "Internal Error in KV Asset Handler"; }
        if (status === void 0) { status = 500; }
        return _super.call(this, message, status) || this;
    }
    return InternalError;
}(KVError));
exports.InternalError = InternalError;

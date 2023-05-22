"use strict";
exports.__esModule = true;
exports.polyfill = void 0;
var polyfill = function (environment) {
    Object.entries(environment).map(function (_a) {
        var name = _a[0], value = _a[1];
        Object.defineProperty(globalThis, name, {
            value: value,
            configurable: true,
            enumerable: true,
            writable: true
        });
    });
};
exports.polyfill = polyfill;

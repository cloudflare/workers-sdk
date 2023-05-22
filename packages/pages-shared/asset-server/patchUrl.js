"use strict";
exports.__esModule = true;
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
globalThis.URL = (function (globalURL) {
    PatchedURL.prototype = globalURL.prototype;
    PatchedURL.createObjectURL = globalURL.createObjectURL;
    PatchedURL.revokeObjectURL = globalURL.revokeObjectURL;
    return PatchedURL;
    function PatchedURL(input, base) {
        var url = new globalURL(encodeURI(input), base);
        return new Proxy(url, {
            get: function (target, prop) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return globalThis.decodeURIComponent(target[prop]);
            }
        });
    }
})(URL);

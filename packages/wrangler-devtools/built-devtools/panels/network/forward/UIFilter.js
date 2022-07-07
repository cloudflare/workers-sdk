// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var FilterType;
(function (FilterType) {
    FilterType["Domain"] = "domain";
    FilterType["HasResponseHeader"] = "has-response-header";
    FilterType["ResponseHeaderValueSetCookie"] = "response-header-set-cookie";
    FilterType["Is"] = "is";
    FilterType["LargerThan"] = "larger-than";
    FilterType["Method"] = "method";
    FilterType["MimeType"] = "mime-type";
    FilterType["MixedContent"] = "mixed-content";
    FilterType["Priority"] = "priority";
    FilterType["Scheme"] = "scheme";
    FilterType["SetCookieDomain"] = "set-cookie-domain";
    FilterType["SetCookieName"] = "set-cookie-name";
    FilterType["SetCookieValue"] = "set-cookie-value";
    FilterType["ResourceType"] = "resource-type";
    FilterType["CookieDomain"] = "cookie-domain";
    FilterType["CookieName"] = "cookie-name";
    FilterType["CookiePath"] = "cookie-path";
    FilterType["CookieValue"] = "cookie-value";
    FilterType["StatusCode"] = "status-code";
    FilterType["Url"] = "url";
})(FilterType || (FilterType = {}));
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var IsFilterType;
(function (IsFilterType) {
    IsFilterType["Running"] = "running";
    IsFilterType["FromCache"] = "from-cache";
    IsFilterType["ServiceWorkerIntercepted"] = "service-worker-intercepted";
    IsFilterType["ServiceWorkerInitiated"] = "service-worker-initiated";
})(IsFilterType || (IsFilterType = {}));
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var MixedContentFilterValues;
(function (MixedContentFilterValues) {
    MixedContentFilterValues["All"] = "all";
    MixedContentFilterValues["Displayed"] = "displayed";
    MixedContentFilterValues["Blocked"] = "blocked";
    MixedContentFilterValues["BlockOverridden"] = "block-overridden";
})(MixedContentFilterValues || (MixedContentFilterValues = {}));
export class UIRequestFilter {
    filters;
    constructor(filters) {
        this.filters = filters;
    }
    static filters(filters) {
        return new UIRequestFilter(filters);
    }
}
//# sourceMappingURL=UIFilter.js.map
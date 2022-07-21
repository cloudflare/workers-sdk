// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var UIHeaderSection;
(function (UIHeaderSection) {
    UIHeaderSection["General"] = "General";
    UIHeaderSection["Request"] = "Request";
    UIHeaderSection["Response"] = "Response";
})(UIHeaderSection || (UIHeaderSection = {}));
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var UIRequestTabs;
(function (UIRequestTabs) {
    UIRequestTabs["Cookies"] = "cookies";
    UIRequestTabs["EventSource"] = "eventSource";
    UIRequestTabs["Headers"] = "headers";
    UIRequestTabs["HeadersComponent"] = "headersComponent";
    UIRequestTabs["Payload"] = "payload";
    UIRequestTabs["Initiator"] = "initiator";
    UIRequestTabs["Preview"] = "preview";
    UIRequestTabs["Response"] = "response";
    UIRequestTabs["Timing"] = "timing";
    UIRequestTabs["TrustTokens"] = "trustTokens";
    UIRequestTabs["WsFrames"] = "webSocketFrames";
})(UIRequestTabs || (UIRequestTabs = {}));
export class UIRequestLocation {
    request;
    header;
    searchMatch;
    isUrlMatch;
    tab;
    filterOptions;
    constructor(request, header, searchMatch, urlMatch, tab, filterOptions) {
        this.request = request;
        this.header = header;
        this.searchMatch = searchMatch;
        this.isUrlMatch = urlMatch;
        this.tab = tab;
        this.filterOptions = filterOptions;
    }
    static requestHeaderMatch(request, header) {
        return new UIRequestLocation(request, { section: UIHeaderSection.Request, header }, null, false, undefined, undefined);
    }
    static responseHeaderMatch(request, header) {
        return new UIRequestLocation(request, { section: UIHeaderSection.Response, header }, null, false, undefined, undefined);
    }
    static bodyMatch(request, searchMatch) {
        return new UIRequestLocation(request, null, searchMatch, false, undefined, undefined);
    }
    static urlMatch(request) {
        return new UIRequestLocation(request, null, null, true, undefined, undefined);
    }
    static header(request, section, name) {
        return new UIRequestLocation(request, { section, header: { name, value: '' } }, null, false, undefined, undefined);
    }
    static tab(request, tab, filterOptions) {
        return new UIRequestLocation(request, null, null, false, tab, filterOptions);
    }
}
//# sourceMappingURL=UIRequestLocation.js.map
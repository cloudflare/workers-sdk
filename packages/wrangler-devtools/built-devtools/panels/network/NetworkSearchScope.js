// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as Logs from '../../models/logs/logs.js';
import * as NetworkForward from '../../panels/network/forward/forward.js';
const UIStrings = {
    /**
    *@description Text for web URLs
    */
    url: 'URL',
};
const str_ = i18n.i18n.registerUIStrings('panels/network/NetworkSearchScope.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class NetworkSearchScope {
    performIndexing(progress) {
        queueMicrotask(() => {
            progress.done();
        });
    }
    async performSearch(searchConfig, progress, searchResultCallback, searchFinishedCallback) {
        const promises = [];
        const requests = Logs.NetworkLog.NetworkLog.instance().requests().filter(request => searchConfig.filePathMatchesFileQuery(request.url()));
        progress.setTotalWork(requests.length);
        for (const request of requests) {
            const promise = this.searchRequest(searchConfig, request, progress);
            promises.push(promise);
        }
        const resultsWithNull = await Promise.all(promises);
        const results = resultsWithNull.filter(result => result !== null);
        if (progress.isCanceled()) {
            searchFinishedCallback(false);
            return;
        }
        for (const result of results.sort((r1, r2) => r1.label().localeCompare(r2.label()))) {
            if (result.matchesCount() > 0) {
                searchResultCallback(result);
            }
        }
        progress.done();
        searchFinishedCallback(true);
    }
    async searchRequest(searchConfig, request, progress) {
        let bodyMatches = [];
        if (request.contentType().isTextType()) {
            bodyMatches =
                await request.searchInContent(searchConfig.query(), !searchConfig.ignoreCase(), searchConfig.isRegex());
        }
        if (progress.isCanceled()) {
            return null;
        }
        const locations = [];
        if (stringMatchesQuery(request.url())) {
            locations.push(NetworkForward.UIRequestLocation.UIRequestLocation.urlMatch(request));
        }
        for (const header of request.requestHeaders()) {
            if (headerMatchesQuery(header)) {
                locations.push(NetworkForward.UIRequestLocation.UIRequestLocation.requestHeaderMatch(request, header));
            }
        }
        for (const header of request.responseHeaders) {
            if (headerMatchesQuery(header)) {
                locations.push(NetworkForward.UIRequestLocation.UIRequestLocation.responseHeaderMatch(request, header));
            }
        }
        for (const match of bodyMatches) {
            locations.push(NetworkForward.UIRequestLocation.UIRequestLocation.bodyMatch(request, match));
        }
        progress.incrementWorked();
        return new NetworkSearchResult(request, locations);
        function headerMatchesQuery(header) {
            return stringMatchesQuery(`${header.name}: ${header.value}`);
        }
        function stringMatchesQuery(string) {
            const flags = searchConfig.ignoreCase() ? 'i' : '';
            const regExps = searchConfig.queries().map(query => new RegExp(Platform.StringUtilities.escapeForRegExp(query), flags));
            let pos = 0;
            for (const regExp of regExps) {
                const match = string.substr(pos).match(regExp);
                if (!match || match.index === undefined) {
                    return false;
                }
                pos += match.index + match[0].length;
            }
            return true;
        }
    }
    stopSearch() {
    }
}
export class NetworkSearchResult {
    request;
    locations;
    constructor(request, locations) {
        this.request = request;
        this.locations = locations;
    }
    matchesCount() {
        return this.locations.length;
    }
    label() {
        return this.request.displayName;
    }
    description() {
        const parsedUrl = this.request.parsedURL;
        if (!parsedUrl) {
            return this.request.url();
        }
        return parsedUrl.urlWithoutScheme();
    }
    matchLineContent(index) {
        const location = this.locations[index];
        if (location.isUrlMatch) {
            return this.request.url();
        }
        const header = location?.header?.header;
        if (header) {
            return header.value;
        }
        return location.searchMatch.lineContent;
    }
    matchRevealable(index) {
        return this.locations[index];
    }
    matchLabel(index) {
        const location = this.locations[index];
        if (location.isUrlMatch) {
            return i18nString(UIStrings.url);
        }
        const header = location?.header?.header;
        if (header) {
            return `${header.name}:`;
        }
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
        // @ts-expect-error
        return location.searchMatch.lineNumber + 1;
    }
}
//# sourceMappingURL=NetworkSearchScope.js.map
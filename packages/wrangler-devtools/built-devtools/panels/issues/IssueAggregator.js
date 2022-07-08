// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as IssuesManager from '../../models/issues_manager/issues_manager.js';
/**
 * An `AggregatedIssue` representes a number of `IssuesManager.Issue.Issue` objects that are displayed together.
 * Currently only grouping by issue code, is supported. The class provides helpers to support displaying
 * of all resources that are affected by the aggregated issues.
 */
export class AggregatedIssue extends IssuesManager.Issue.Issue {
    #affectedCookies = new Map();
    #affectedRawCookieLines = new Map();
    #affectedRequests = new Map();
    #affectedLocations = new Map();
    #heavyAdIssues = new Set();
    #blockedByResponseDetails = new Map();
    #corsIssues = new Set();
    #cspIssues = new Set();
    #deprecationIssues = new Set();
    #issueKind = IssuesManager.Issue.IssueKind.Improvement;
    #lowContrastIssues = new Set();
    #mixedContentIssues = new Set();
    #sharedArrayBufferIssues = new Set();
    #trustedWebActivityIssues = new Set();
    #quirksModeIssues = new Set();
    #attributionReportingIssues = new Set();
    #genericIssues = new Set();
    #representative;
    #aggregatedIssuesCount = 0;
    #key;
    constructor(code, aggregationKey) {
        super(code);
        this.#key = aggregationKey;
    }
    primaryKey() {
        throw new Error('This should never be called');
    }
    aggregationKey() {
        return this.#key;
    }
    getBlockedByResponseDetails() {
        return this.#blockedByResponseDetails.values();
    }
    cookies() {
        return Array.from(this.#affectedCookies.values()).map(x => x.cookie);
    }
    getRawCookieLines() {
        return this.#affectedRawCookieLines.values();
    }
    sources() {
        return this.#affectedLocations.values();
    }
    cookiesWithRequestIndicator() {
        return this.#affectedCookies.values();
    }
    getHeavyAdIssues() {
        return this.#heavyAdIssues;
    }
    getMixedContentIssues() {
        return this.#mixedContentIssues;
    }
    getTrustedWebActivityIssues() {
        return this.#trustedWebActivityIssues;
    }
    getCorsIssues() {
        return this.#corsIssues;
    }
    getCspIssues() {
        return this.#cspIssues;
    }
    getDeprecationIssues() {
        return this.#deprecationIssues;
    }
    getLowContrastIssues() {
        return this.#lowContrastIssues;
    }
    requests() {
        return this.#affectedRequests.values();
    }
    getSharedArrayBufferIssues() {
        return this.#sharedArrayBufferIssues;
    }
    getQuirksModeIssues() {
        return this.#quirksModeIssues;
    }
    getAttributionReportingIssues() {
        return this.#attributionReportingIssues;
    }
    getGenericIssues() {
        return this.#genericIssues;
    }
    getDescription() {
        if (this.#representative) {
            return this.#representative.getDescription();
        }
        return null;
    }
    getCategory() {
        if (this.#representative) {
            return this.#representative.getCategory();
        }
        return IssuesManager.Issue.IssueCategory.Other;
    }
    getAggregatedIssuesCount() {
        return this.#aggregatedIssuesCount;
    }
    /**
     * Produces a primary key for a cookie. Use this instead of `JSON.stringify` in
     * case new fields are added to `AffectedCookie`.
     */
    #keyForCookie(cookie) {
        const { domain, path, name } = cookie;
        return `${domain};${path};${name}`;
    }
    addInstance(issue) {
        this.#aggregatedIssuesCount++;
        if (!this.#representative) {
            this.#representative = issue;
        }
        this.#issueKind = IssuesManager.Issue.unionIssueKind(this.#issueKind, issue.getKind());
        let hasRequest = false;
        for (const request of issue.requests()) {
            hasRequest = true;
            if (!this.#affectedRequests.has(request.requestId)) {
                this.#affectedRequests.set(request.requestId, request);
            }
        }
        for (const cookie of issue.cookies()) {
            const key = this.#keyForCookie(cookie);
            if (!this.#affectedCookies.has(key)) {
                this.#affectedCookies.set(key, { cookie, hasRequest });
            }
        }
        for (const rawCookieLine of issue.rawCookieLines()) {
            if (!this.#affectedRawCookieLines.has(rawCookieLine)) {
                this.#affectedRawCookieLines.set(rawCookieLine, { rawCookieLine, hasRequest });
            }
        }
        for (const location of issue.sources()) {
            const key = JSON.stringify(location);
            if (!this.#affectedLocations.has(key)) {
                this.#affectedLocations.set(key, location);
            }
        }
        if (issue instanceof IssuesManager.MixedContentIssue.MixedContentIssue) {
            this.#mixedContentIssues.add(issue);
        }
        if (issue instanceof IssuesManager.HeavyAdIssue.HeavyAdIssue) {
            this.#heavyAdIssues.add(issue);
        }
        for (const details of issue.getBlockedByResponseDetails()) {
            const key = JSON.stringify(details, ['parentFrame', 'blockedFrame', 'requestId', 'frameId', 'reason', 'request']);
            this.#blockedByResponseDetails.set(key, details);
        }
        if (issue instanceof IssuesManager.TrustedWebActivityIssue.TrustedWebActivityIssue) {
            this.#trustedWebActivityIssues.add(issue);
        }
        if (issue instanceof IssuesManager.ContentSecurityPolicyIssue.ContentSecurityPolicyIssue) {
            this.#cspIssues.add(issue);
        }
        if (issue instanceof IssuesManager.DeprecationIssue.DeprecationIssue) {
            this.#deprecationIssues.add(issue);
        }
        if (issue instanceof IssuesManager.SharedArrayBufferIssue.SharedArrayBufferIssue) {
            this.#sharedArrayBufferIssues.add(issue);
        }
        if (issue instanceof IssuesManager.LowTextContrastIssue.LowTextContrastIssue) {
            this.#lowContrastIssues.add(issue);
        }
        if (issue instanceof IssuesManager.CorsIssue.CorsIssue) {
            this.#corsIssues.add(issue);
        }
        if (issue instanceof IssuesManager.QuirksModeIssue.QuirksModeIssue) {
            this.#quirksModeIssues.add(issue);
        }
        if (issue instanceof IssuesManager.AttributionReportingIssue.AttributionReportingIssue) {
            this.#attributionReportingIssues.add(issue);
        }
        if (issue instanceof IssuesManager.GenericIssue.GenericIssue) {
            this.#genericIssues.add(issue);
        }
    }
    getKind() {
        return this.#issueKind;
    }
    isHidden() {
        return this.#representative?.isHidden() || false;
    }
    setHidden(_value) {
        throw new Error('Should not call setHidden on aggregatedIssue');
    }
}
export class IssueAggregator extends Common.ObjectWrapper.ObjectWrapper {
    issuesManager;
    #aggregatedIssuesByKey = new Map();
    #hiddenAggregatedIssuesByKey = new Map();
    constructor(issuesManager) {
        super();
        this.issuesManager = issuesManager;
        this.issuesManager.addEventListener("IssueAdded" /* IssueAdded */, this.#onIssueAdded, this);
        this.issuesManager.addEventListener("FullUpdateRequired" /* FullUpdateRequired */, this.#onFullUpdateRequired, this);
        for (const issue of this.issuesManager.issues()) {
            this.#aggregateIssue(issue);
        }
    }
    #onIssueAdded(event) {
        this.#aggregateIssue(event.data.issue);
    }
    #onFullUpdateRequired() {
        this.#aggregatedIssuesByKey.clear();
        this.#hiddenAggregatedIssuesByKey.clear();
        for (const issue of this.issuesManager.issues()) {
            this.#aggregateIssue(issue);
        }
        this.dispatchEventToListeners("FullUpdateRequired" /* FullUpdateRequired */);
    }
    #aggregateIssue(issue) {
        const map = issue.isHidden() ? this.#hiddenAggregatedIssuesByKey : this.#aggregatedIssuesByKey;
        const aggregatedIssue = this.#aggregateIssueByStatus(map, issue);
        this.dispatchEventToListeners("AggregatedIssueUpdated" /* AggregatedIssueUpdated */, aggregatedIssue);
        return aggregatedIssue;
    }
    #aggregateIssueByStatus(aggregatedIssuesMap, issue) {
        const key = issue.code();
        let aggregatedIssue = aggregatedIssuesMap.get(key);
        if (!aggregatedIssue) {
            aggregatedIssue = new AggregatedIssue(issue.code(), key);
            aggregatedIssuesMap.set(key, aggregatedIssue);
        }
        aggregatedIssue.addInstance(issue);
        return aggregatedIssue;
    }
    aggregatedIssues() {
        return [...this.#aggregatedIssuesByKey.values(), ...this.#hiddenAggregatedIssuesByKey.values()];
    }
    hiddenAggregatedIssues() {
        return this.#hiddenAggregatedIssuesByKey.values();
    }
    aggregatedIssueCodes() {
        return new Set([...this.#aggregatedIssuesByKey.keys(), ...this.#hiddenAggregatedIssuesByKey.keys()]);
    }
    aggregatedIssueCategories() {
        const result = new Set();
        for (const issue of this.#aggregatedIssuesByKey.values()) {
            result.add(issue.getCategory());
        }
        return result;
    }
    aggregatedIssueKinds() {
        const result = new Set();
        for (const issue of this.#aggregatedIssuesByKey.values()) {
            result.add(issue.getKind());
        }
        return result;
    }
    numberOfAggregatedIssues() {
        return this.#aggregatedIssuesByKey.size;
    }
    numberOfHiddenAggregatedIssues() {
        return this.#hiddenAggregatedIssuesByKey.size;
    }
    keyForIssue(issue) {
        return issue.code();
    }
}
//# sourceMappingURL=IssueAggregator.js.map
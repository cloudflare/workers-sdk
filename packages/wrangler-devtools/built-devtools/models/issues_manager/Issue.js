// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
const UIStrings = {
    /**
     *@description The kind of an issue (plural) (Issues are categorized into kinds).
     */
    improvements: 'Improvements',
    /**
     *@description The kind of an issue (plural) (Issues are categorized into kinds).
     */
    pageErrors: 'Page Errors',
    /**
     *@description The kind of an issue (plural) (Issues are categorized into kinds).
     */
    breakingChanges: 'Breaking Changes',
    /**
     *@description A description for a kind of issue we display in the issues tab.
     */
    pageErrorIssue: 'A page error issue: the page is not working correctly',
    /**
     *@description A description for a kind of issue we display in the issues tab.
     */
    breakingChangeIssue: 'A breaking change issue: the page may stop working in an upcoming version of Chrome',
    /**
     *@description A description for a kind of issue we display in the issues tab.
     */
    improvementIssue: 'An improvement issue: there is an opportunity to improve the page',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/Issue.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
// eslint-disable-next-line rulesdir/const_enum
export var IssueCategory;
(function (IssueCategory) {
    IssueCategory["CrossOriginEmbedderPolicy"] = "CrossOriginEmbedderPolicy";
    IssueCategory["Generic"] = "Generic";
    IssueCategory["MixedContent"] = "MixedContent";
    IssueCategory["Cookie"] = "Cookie";
    IssueCategory["HeavyAd"] = "HeavyAd";
    IssueCategory["ContentSecurityPolicy"] = "ContentSecurityPolicy";
    IssueCategory["TrustedWebActivity"] = "TrustedWebActivity";
    IssueCategory["LowTextContrast"] = "LowTextContrast";
    IssueCategory["Cors"] = "Cors";
    IssueCategory["AttributionReporting"] = "AttributionReporting";
    IssueCategory["QuirksMode"] = "QuirksMode";
    IssueCategory["Other"] = "Other";
})(IssueCategory || (IssueCategory = {}));
// eslint-disable-next-line rulesdir/const_enum
export var IssueKind;
(function (IssueKind) {
    /**
     * Something is not working in the page right now. Issues of this kind need
     * usually be fixed right away. They usually indicate that a Web API is being
     * used in a wrong way, or that a network request was misconfigured.
     */
    IssueKind["PageError"] = "PageError";
    /**
     * The page is using a Web API or relying on browser behavior that is going
     * to change in the future. If possible, the message associated with issues
     * of this kind should include a time when the behavior is going to change.
     */
    IssueKind["BreakingChange"] = "BreakingChange";
    /**
     * Anything that can be improved about the page, but isn't urgent and doesn't
     * impair functionality in a major way.
     */
    IssueKind["Improvement"] = "Improvement";
})(IssueKind || (IssueKind = {}));
export function getIssueKindName(issueKind) {
    switch (issueKind) {
        case IssueKind.BreakingChange:
            return i18nString(UIStrings.breakingChanges);
        case IssueKind.Improvement:
            return i18nString(UIStrings.improvements);
        case IssueKind.PageError:
            return i18nString(UIStrings.pageErrors);
    }
}
export function getIssueKindDescription(issueKind) {
    switch (issueKind) {
        case IssueKind.PageError:
            return i18nString(UIStrings.pageErrorIssue);
        case IssueKind.BreakingChange:
            return i18nString(UIStrings.breakingChangeIssue);
        case IssueKind.Improvement:
            return i18nString(UIStrings.improvementIssue);
    }
}
/**
 * Union two issue kinds for issue aggregation. The idea is to show the most
 * important kind on aggregated issues that union issues of different kinds.
 */
export function unionIssueKind(a, b) {
    if (a === IssueKind.PageError || b === IssueKind.PageError) {
        return IssueKind.PageError;
    }
    if (a === IssueKind.BreakingChange || b === IssueKind.BreakingChange) {
        return IssueKind.BreakingChange;
    }
    return IssueKind.Improvement;
}
export function getShowThirdPartyIssuesSetting() {
    return Common.Settings.Settings.instance().createSetting('showThirdPartyIssues', false);
}
export class Issue {
    #issueCode;
    #issuesModel;
    issueId = undefined;
    #hidden;
    constructor(code, issuesModel = null, issueId) {
        this.#issueCode = typeof code === 'object' ? code.code : code;
        this.#issuesModel = issuesModel;
        this.issueId = issueId;
        Host.userMetrics.issueCreated(typeof code === 'string' ? code : code.umaCode);
        this.#hidden = false;
    }
    code() {
        return this.#issueCode;
    }
    getBlockedByResponseDetails() {
        return [];
    }
    cookies() {
        return [];
    }
    rawCookieLines() {
        return [];
    }
    elements() {
        return [];
    }
    requests() {
        return [];
    }
    sources() {
        return [];
    }
    isAssociatedWithRequestId(requestId) {
        for (const request of this.requests()) {
            if (request.requestId === requestId) {
                return true;
            }
        }
        return false;
    }
    /**
     * The model might be unavailable or belong to a target that has already been disposed.
     */
    model() {
        return this.#issuesModel;
    }
    isCausedByThirdParty() {
        return false;
    }
    getIssueId() {
        return this.issueId;
    }
    isHidden() {
        return this.#hidden;
    }
    setHidden(hidden) {
        this.#hidden = hidden;
    }
}
export function toZeroBasedLocation(location) {
    if (!location) {
        return undefined;
    }
    return {
        url: location.url,
        scriptId: location.scriptId,
        lineNumber: location.lineNumber,
        columnNumber: location.columnNumber === 0 ? undefined : location.columnNumber - 1,
    };
}
//# sourceMappingURL=Issue.js.map
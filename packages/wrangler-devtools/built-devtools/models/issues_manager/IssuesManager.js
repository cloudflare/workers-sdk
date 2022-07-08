// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import { AttributionReportingIssue } from './AttributionReportingIssue.js';
import { ClientHintIssue } from './ClientHintIssue.js';
import { ContentSecurityPolicyIssue } from './ContentSecurityPolicyIssue.js';
import { CorsIssue } from './CorsIssue.js';
import { CrossOriginEmbedderPolicyIssue, isCrossOriginEmbedderPolicyIssue } from './CrossOriginEmbedderPolicyIssue.js';
import { DeprecationIssue } from './DeprecationIssue.js';
import { FederatedAuthRequestIssue } from './FederatedAuthRequestIssue.js';
import { GenericIssue } from './GenericIssue.js';
import { HeavyAdIssue } from './HeavyAdIssue.js';
import { LowTextContrastIssue } from './LowTextContrastIssue.js';
import { MixedContentIssue } from './MixedContentIssue.js';
import { NavigatorUserAgentIssue } from './NavigatorUserAgentIssue.js';
import { QuirksModeIssue } from './QuirksModeIssue.js';
import { CookieIssue } from './CookieIssue.js';
import { SharedArrayBufferIssue } from './SharedArrayBufferIssue.js';
import { SourceFrameIssuesManager } from './SourceFrameIssuesManager.js';
import { TrustedWebActivityIssue } from './TrustedWebActivityIssue.js';
let issuesManagerInstance = null;
function createIssuesForBlockedByResponseIssue(issuesModel, inspectorIssue) {
    const blockedByResponseIssueDetails = inspectorIssue.details.blockedByResponseIssueDetails;
    if (!blockedByResponseIssueDetails) {
        console.warn('BlockedByResponse issue without details received.');
        return [];
    }
    if (isCrossOriginEmbedderPolicyIssue(blockedByResponseIssueDetails.reason)) {
        return [new CrossOriginEmbedderPolicyIssue(blockedByResponseIssueDetails, issuesModel)];
    }
    return [];
}
const issueCodeHandlers = new Map([
    [
        "CookieIssue" /* CookieIssue */,
        CookieIssue.fromInspectorIssue,
    ],
    [
        "MixedContentIssue" /* MixedContentIssue */,
        MixedContentIssue.fromInspectorIssue,
    ],
    [
        "HeavyAdIssue" /* HeavyAdIssue */,
        HeavyAdIssue.fromInspectorIssue,
    ],
    [
        "ContentSecurityPolicyIssue" /* ContentSecurityPolicyIssue */,
        ContentSecurityPolicyIssue.fromInspectorIssue,
    ],
    ["BlockedByResponseIssue" /* BlockedByResponseIssue */, createIssuesForBlockedByResponseIssue],
    [
        "SharedArrayBufferIssue" /* SharedArrayBufferIssue */,
        SharedArrayBufferIssue.fromInspectorIssue,
    ],
    [
        "TrustedWebActivityIssue" /* TrustedWebActivityIssue */,
        TrustedWebActivityIssue.fromInspectorIssue,
    ],
    [
        "LowTextContrastIssue" /* LowTextContrastIssue */,
        LowTextContrastIssue.fromInspectorIssue,
    ],
    [
        "CorsIssue" /* CorsIssue */,
        CorsIssue.fromInspectorIssue,
    ],
    [
        "QuirksModeIssue" /* QuirksModeIssue */,
        QuirksModeIssue.fromInspectorIssue,
    ],
    [
        "NavigatorUserAgentIssue" /* NavigatorUserAgentIssue */,
        NavigatorUserAgentIssue.fromInspectorIssue,
    ],
    [
        "AttributionReportingIssue" /* AttributionReportingIssue */,
        AttributionReportingIssue.fromInspectorIssue,
    ],
    [
        "GenericIssue" /* GenericIssue */,
        GenericIssue.fromInspectorIssue,
    ],
    [
        "DeprecationIssue" /* DeprecationIssue */,
        DeprecationIssue.fromInspectorIssue,
    ],
    [
        "ClientHintIssue" /* ClientHintIssue */,
        ClientHintIssue.fromInspectorIssue,
    ],
    [
        "FederatedAuthRequestIssue" /* FederatedAuthRequestIssue */,
        FederatedAuthRequestIssue.fromInspectorIssue,
    ],
]);
/**
 * Each issue reported by the backend can result in multiple `Issue` instances.
 * Handlers are simple functions hard-coded into a map.
 */
function createIssuesFromProtocolIssue(issuesModel, inspectorIssue) {
    const handler = issueCodeHandlers.get(inspectorIssue.code);
    if (handler) {
        return handler(issuesModel, inspectorIssue);
    }
    console.warn(`No handler registered for issue code ${inspectorIssue.code}`);
    return [];
}
export function defaultHideIssueByCodeSetting() {
    const setting = {};
    return setting;
}
export function getHideIssueByCodeSetting() {
    return Common.Settings.Settings.instance().createSetting('HideIssueByCodeSetting-Experiment-2021', defaultHideIssueByCodeSetting());
}
/**
 * The `IssuesManager` is the central storage for issues. It collects issues from all the
 * `IssuesModel` instances in the page, and deduplicates them wrt their primary key.
 * It also takes care of clearing the issues when it sees a main-frame navigated event.
 * Any client can subscribe to the events provided, and/or query the issues via the public
 * interface.
 *
 * Additionally, the `IssuesManager` can filter Issues. All Issues are stored, but only
 * Issues that are accepted by the filter cause events to be fired or are returned by
 * `IssuesManager#issues()`.
 */
export class IssuesManager extends Common.ObjectWrapper.ObjectWrapper {
    showThirdPartyIssuesSetting;
    hideIssueSetting;
    #eventListeners = new WeakMap();
    #allIssues = new Map();
    #filteredIssues = new Map();
    #issueCounts = new Map();
    #hiddenIssueCount = new Map();
    #hasSeenTopFrameNavigated = false;
    #issuesById = new Map();
    constructor(showThirdPartyIssuesSetting, hideIssueSetting) {
        super();
        this.showThirdPartyIssuesSetting = showThirdPartyIssuesSetting;
        this.hideIssueSetting = hideIssueSetting;
        new SourceFrameIssuesManager(this);
        SDK.TargetManager.TargetManager.instance().observeModels(SDK.IssuesModel.IssuesModel, this);
        SDK.FrameManager.FrameManager.instance().addEventListener(SDK.FrameManager.Events.TopFrameNavigated, this.#onTopFrameNavigated, this);
        SDK.FrameManager.FrameManager.instance().addEventListener(SDK.FrameManager.Events.FrameAddedToTarget, this.#onFrameAddedToTarget, this);
        // issueFilter uses the 'showThirdPartyIssues' setting. Clients of IssuesManager need
        // a full update when the setting changes to get an up-to-date issues list.
        this.showThirdPartyIssuesSetting?.addChangeListener(() => this.#updateFilteredIssues());
        if (Root.Runtime.experiments.isEnabled('hideIssuesFeature')) {
            this.hideIssueSetting?.addChangeListener(() => this.#updateFilteredIssues());
        }
    }
    static instance(opts = {
        forceNew: false,
        ensureFirst: false,
    }) {
        if (issuesManagerInstance && opts.ensureFirst) {
            throw new Error('IssuesManager was already created. Either set "ensureFirst" to false or make sure that this invocation is really the first one.');
        }
        if (!issuesManagerInstance || opts.forceNew) {
            issuesManagerInstance = new IssuesManager(opts.showThirdPartyIssuesSetting, opts.hideIssueSetting);
        }
        return issuesManagerInstance;
    }
    static removeInstance() {
        issuesManagerInstance = null;
    }
    /**
     * Once we have seen at least one `TopFrameNavigated` event, we can be reasonably sure
     * that we also collected issues that were reported during the navigation to the current
     * page. If we haven't seen a main frame navigated, we might have missed issues that arose
     * during navigation.
     */
    reloadForAccurateInformationRequired() {
        return !this.#hasSeenTopFrameNavigated;
    }
    #onTopFrameNavigated(event) {
        const { frame } = event.data;
        const keptIssues = new Map();
        for (const [key, issue] of this.#allIssues.entries()) {
            if (issue.isAssociatedWithRequestId(frame.loaderId)) {
                keptIssues.set(key, issue);
            }
        }
        this.#allIssues = keptIssues;
        this.#hasSeenTopFrameNavigated = true;
        this.#updateFilteredIssues();
    }
    #onFrameAddedToTarget(event) {
        const { frame } = event.data;
        // Determining third-party status usually requires the registered domain of the top frame.
        // When DevTools is opened after navigation has completed, issues may be received
        // before the top frame is available. Thus, we trigger a recalcuation of third-party-ness
        // when we attach to the top frame.
        if (frame.isTopFrame()) {
            this.#updateFilteredIssues();
        }
    }
    modelAdded(issuesModel) {
        const listener = issuesModel.addEventListener("IssueAdded" /* IssueAdded */, this.#onIssueAddedEvent, this);
        this.#eventListeners.set(issuesModel, listener);
    }
    modelRemoved(issuesModel) {
        const listener = this.#eventListeners.get(issuesModel);
        if (listener) {
            Common.EventTarget.removeEventListeners([listener]);
        }
    }
    #onIssueAddedEvent(event) {
        const { issuesModel, inspectorIssue } = event.data;
        const issues = createIssuesFromProtocolIssue(issuesModel, inspectorIssue);
        for (const issue of issues) {
            this.addIssue(issuesModel, issue);
        }
    }
    addIssue(issuesModel, issue) {
        // Ignore issues without proper description; they are invisible to the user and only cause confusion.
        if (!issue.getDescription()) {
            return;
        }
        const primaryKey = issue.primaryKey();
        if (this.#allIssues.has(primaryKey)) {
            return;
        }
        this.#allIssues.set(primaryKey, issue);
        if (this.#issueFilter(issue)) {
            this.#filteredIssues.set(primaryKey, issue);
            this.#issueCounts.set(issue.getKind(), 1 + (this.#issueCounts.get(issue.getKind()) || 0));
            const issueId = issue.getIssueId();
            if (issueId) {
                this.#issuesById.set(issueId, issue);
            }
            const values = this.hideIssueSetting?.get();
            const hideIssuesFeature = Root.Runtime.experiments.isEnabled('hideIssuesFeature');
            if (hideIssuesFeature) {
                this.#updateIssueHiddenStatus(issue, values);
            }
            if (issue.isHidden()) {
                this.#hiddenIssueCount.set(issue.getKind(), 1 + (this.#hiddenIssueCount.get(issue.getKind()) || 0));
            }
            this.dispatchEventToListeners("IssueAdded" /* IssueAdded */, { issuesModel, issue });
        }
        // Always fire the "count" event even if the issue was filtered out.
        // The result of `hasOnlyThirdPartyIssues` could still change.
        this.dispatchEventToListeners("IssuesCountUpdated" /* IssuesCountUpdated */);
    }
    issues() {
        return this.#filteredIssues.values();
    }
    numberOfIssues(kind) {
        if (kind) {
            return (this.#issueCounts.get(kind) ?? 0) - this.numberOfHiddenIssues(kind);
        }
        return this.#filteredIssues.size - this.numberOfHiddenIssues();
    }
    numberOfHiddenIssues(kind) {
        if (kind) {
            return this.#hiddenIssueCount.get(kind) ?? 0;
        }
        let count = 0;
        for (const num of this.#hiddenIssueCount.values()) {
            count += num;
        }
        return count;
    }
    numberOfAllStoredIssues() {
        return this.#allIssues.size;
    }
    #issueFilter(issue) {
        return this.showThirdPartyIssuesSetting?.get() || !issue.isCausedByThirdParty();
    }
    #updateIssueHiddenStatus(issue, values) {
        const code = issue.code();
        // All issues are hidden via their code.
        // For hiding we check whether the issue code is present and has a value of IssueStatus.Hidden
        // assosciated with it. If all these conditions are met the issue is hidden.
        // IssueStatus is set in hidden issues menu.
        // In case a user wants to hide a specific issue, the issue code is added to "code" section
        // of our setting and its value is set to IssueStatus.Hidden. Then issue then gets hidden.
        if (values && values[code]) {
            if (values[code] === "Hidden" /* Hidden */) {
                issue.setHidden(true);
                return;
            }
            issue.setHidden(false);
            return;
        }
    }
    #updateFilteredIssues() {
        this.#filteredIssues.clear();
        this.#issueCounts.clear();
        this.#issuesById.clear();
        this.#hiddenIssueCount.clear();
        const values = this.hideIssueSetting?.get();
        const hideIssuesFeature = Root.Runtime.experiments.isEnabled('hideIssuesFeature');
        for (const [key, issue] of this.#allIssues) {
            if (this.#issueFilter(issue)) {
                if (hideIssuesFeature) {
                    this.#updateIssueHiddenStatus(issue, values);
                }
                this.#filteredIssues.set(key, issue);
                this.#issueCounts.set(issue.getKind(), 1 + (this.#issueCounts.get(issue.getKind()) ?? 0));
                if (issue.isHidden()) {
                    this.#hiddenIssueCount.set(issue.getKind(), 1 + (this.#hiddenIssueCount.get(issue.getKind()) || 0));
                }
                const issueId = issue.getIssueId();
                if (issueId) {
                    this.#issuesById.set(issueId, issue);
                }
            }
        }
        this.dispatchEventToListeners("FullUpdateRequired" /* FullUpdateRequired */);
        this.dispatchEventToListeners("IssuesCountUpdated" /* IssuesCountUpdated */);
    }
    unhideAllIssues() {
        for (const issue of this.#allIssues.values()) {
            issue.setHidden(false);
        }
        this.hideIssueSetting?.set(defaultHideIssueByCodeSetting());
    }
    getIssueById(id) {
        return this.#issuesById.get(id);
    }
}
// @ts-ignore
globalThis.addIssueForTest = (issue) => {
    const mainTarget = SDK.TargetManager.TargetManager.instance().mainTarget();
    const issuesModel = mainTarget?.model(SDK.IssuesModel.IssuesModel);
    issuesModel?.issueAdded({ issue });
};
//# sourceMappingURL=IssuesManager.js.map
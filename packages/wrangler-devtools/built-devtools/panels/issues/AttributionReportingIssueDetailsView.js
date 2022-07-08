// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as IssuesManager from '../../models/issues_manager/issues_manager.js';
import { AffectedResourcesView } from './AffectedResourcesView.js';
const UIStrings = {
    /**
     * @description Label for number of rows in the issue details table.
     */
    nViolations: '{n, plural, =1 {# violation} other {# violations}}',
    /**
     * @description Noun, label for the column showing the associated frame in the issue details table.
     * The associated frame can either be the "main frame" (or main window), or an HTML iframe.
     */
    frame: 'Frame',
    /**
     * @description Noun, label for the column showing the associated HTML element in the issue details table.
     */
    element: 'Element',
    /**
     * @description Noun, label for the column showing the invalid header value in the issue details table.
     */
    invalidHeaderValue: 'Invalid Header Value',
    /**
     * @description Noun, label for the column showing the associated network request in the issue details table.
     */
    request: 'Request',
    /**
     * @description Label for the column showing the invalid URL used in an HTML anchor element ("a link").
     * A origin is (roughly said) the front part of a URL.
     */
    untrustworthyOrigin: 'Untrustworthy origin',
};
const str_ = i18n.i18n.registerUIStrings('panels/issues/AttributionReportingIssueDetailsView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class AttributionReportingIssueDetailsView extends AffectedResourcesView {
    getResourceNameWithCount(count) {
        return i18nString(UIStrings.nViolations, { n: count });
    }
    update() {
        this.clear();
        const issues = this.issue.getAttributionReportingIssues();
        if (issues.size > 0) {
            this.#appendDetails(issues.values().next().value.code(), issues);
        }
        else {
            this.updateAffectedResourceCount(0);
        }
    }
    #appendDetails(issueCode, issues) {
        const header = document.createElement('tr');
        switch (issueCode) {
            case "AttributionReportingIssue::AttributionUntrustworthyFrameOrigin" /* AttributionUntrustworthyFrameOrigin */:
                this.appendColumnTitle(header, i18nString(UIStrings.frame));
                this.appendColumnTitle(header, i18nString(UIStrings.request));
                this.appendColumnTitle(header, i18nString(UIStrings.untrustworthyOrigin));
                break;
            case "AttributionReportingIssue::AttributionUntrustworthyOrigin" /* AttributionUntrustworthyOrigin */:
                this.appendColumnTitle(header, i18nString(UIStrings.request));
                this.appendColumnTitle(header, i18nString(UIStrings.untrustworthyOrigin));
                break;
            case "AttributionReportingIssue::AttributionSourceUntrustworthyFrameOrigin" /* AttributionSourceUntrustworthyFrameOrigin */:
                this.appendColumnTitle(header, i18nString(UIStrings.frame));
                this.appendColumnTitle(header, i18nString(UIStrings.element));
                this.appendColumnTitle(header, i18nString(UIStrings.untrustworthyOrigin));
                break;
            case "AttributionReportingIssue::AttributionSourceUntrustworthyOrigin" /* AttributionSourceUntrustworthyOrigin */:
                this.appendColumnTitle(header, i18nString(UIStrings.element));
                this.appendColumnTitle(header, i18nString(UIStrings.untrustworthyOrigin));
                break;
            case "AttributionReportingIssue::InvalidHeader" /* InvalidHeader */:
                this.appendColumnTitle(header, i18nString(UIStrings.frame));
                this.appendColumnTitle(header, i18nString(UIStrings.request));
                this.appendColumnTitle(header, i18nString(UIStrings.invalidHeaderValue));
                break;
            case "AttributionReportingIssue::PermissionPolicyDisabled" /* PermissionPolicyDisabled */:
                this.appendColumnTitle(header, i18nString(UIStrings.frame));
                this.appendColumnTitle(header, i18nString(UIStrings.element));
                this.appendColumnTitle(header, i18nString(UIStrings.request));
                break;
        }
        this.affectedResources.appendChild(header);
        let count = 0;
        for (const issue of issues) {
            count++;
            void this.#appendDetail(issueCode, issue);
        }
        this.updateAffectedResourceCount(count);
    }
    async #appendDetail(issueCode, issue) {
        const element = document.createElement('tr');
        element.classList.add('affected-resource-directive');
        const details = issue.issueDetails;
        switch (issueCode) {
            case "AttributionReportingIssue::AttributionSourceUntrustworthyOrigin" /* AttributionSourceUntrustworthyOrigin */:
                await this.#appendElementOrEmptyCell(element, issue);
                this.appendIssueDetailCell(element, details.invalidParameter || '');
                break;
            case "AttributionReportingIssue::AttributionUntrustworthyOrigin" /* AttributionUntrustworthyOrigin */:
                this.#appendRequestOrEmptyCell(element, details.request);
                this.appendIssueDetailCell(element, details.invalidParameter || '');
                break;
            case "AttributionReportingIssue::InvalidHeader" /* InvalidHeader */:
                this.#appendFrameOrEmptyCell(element, issue);
                this.#appendRequestOrEmptyCell(element, details.request);
                this.appendIssueDetailCell(element, details.invalidParameter || '');
                break;
            case "AttributionReportingIssue::PermissionPolicyDisabled" /* PermissionPolicyDisabled */:
                this.#appendFrameOrEmptyCell(element, issue);
                await this.#appendElementOrEmptyCell(element, issue);
                this.#appendRequestOrEmptyCell(element, details.request);
                break;
        }
        this.affectedResources.appendChild(element);
    }
    #appendFrameOrEmptyCell(parent, issue) {
        const details = issue.issueDetails;
        if (details.frame) {
            parent.appendChild(this.createFrameCell(details.frame.frameId, issue.getCategory()));
        }
        else {
            this.appendIssueDetailCell(parent, '');
        }
    }
    async #appendElementOrEmptyCell(parent, issue) {
        const details = issue.issueDetails;
        if (details.violatingNodeId !== undefined) {
            const target = issue.model()?.target() || null;
            parent.appendChild(await this.createElementCell({ backendNodeId: details.violatingNodeId, target, nodeName: 'Attribution source element' }, issue.getCategory()));
        }
        else {
            this.appendIssueDetailCell(parent, '');
        }
    }
    #appendRequestOrEmptyCell(parent, request) {
        if (!request) {
            this.appendIssueDetailCell(parent, '');
            return;
        }
        const opts = {
            additionalOnClickAction() {
                Host.userMetrics.issuesPanelResourceOpened(IssuesManager.Issue.IssueCategory.AttributionReporting, "Request" /* Request */);
            },
        };
        parent.appendChild(this.createRequestCell(request, opts));
    }
}
//# sourceMappingURL=AttributionReportingIssueDetailsView.js.map
// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import { resolveLazyDescription } from './MarkdownIssueDescription.js';
const UIStrings = {
    /**
    *@description Title for Client Hint specification url link
    */
    clientHintsInfrastructure: 'Client Hints Infrastructure',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/ClientHintIssue.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
export class ClientHintIssue extends Issue {
    issueDetails;
    constructor(issueDetails, issuesModel) {
        super({
            code: "ClientHintIssue" /* ClientHintIssue */,
            umaCode: ["ClientHintIssue" /* ClientHintIssue */, issueDetails.clientHintIssueReason].join('::'),
        }, issuesModel);
        this.issueDetails = issueDetails;
    }
    getCategory() {
        return IssueCategory.Other;
    }
    details() {
        return this.issueDetails;
    }
    getDescription() {
        const description = issueDescriptions.get(this.issueDetails.clientHintIssueReason);
        if (!description) {
            return null;
        }
        return resolveLazyDescription(description);
    }
    sources() {
        return [this.issueDetails.sourceCodeLocation];
    }
    primaryKey() {
        return JSON.stringify(this.issueDetails);
    }
    getKind() {
        return IssueKind.BreakingChange;
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const details = inspectorIssue.details.clientHintIssueDetails;
        if (!details) {
            console.warn('Client Hint issue without details received.');
            return [];
        }
        return [new ClientHintIssue(details, issuesModel)];
    }
}
const issueDescriptions = new Map([
    [
        "MetaTagAllowListInvalidOrigin" /* MetaTagAllowListInvalidOrigin */,
        {
            file: 'clientHintMetaTagAllowListInvalidOrigin.md',
            links: [{
                    link: 'https://wicg.github.io/client-hints-infrastructure/',
                    linkTitle: i18nLazyString(UIStrings.clientHintsInfrastructure),
                }],
        },
    ],
    [
        "MetaTagModifiedHTML" /* MetaTagModifiedHTML */,
        {
            file: 'clientHintMetaTagModifiedHTML.md',
            links: [{
                    link: 'https://wicg.github.io/client-hints-infrastructure/',
                    linkTitle: i18nLazyString(UIStrings.clientHintsInfrastructure),
                }],
        },
    ],
]);
//# sourceMappingURL=ClientHintIssue.js.map
// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import { resolveLazyDescription } from './MarkdownIssueDescription.js';
const UIStrings = {
    /**
    *@description Title for cross-origin portal post message error
    */
    crossOriginPortalPostMessage: 'Portals - Same-origin communication channels',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/GenericIssue.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
export class GenericIssue extends Issue {
    #issueDetails;
    constructor(issueDetails, issuesModel, issueId) {
        const issueCode = [
            "GenericIssue" /* GenericIssue */,
            issueDetails.errorType,
        ].join('::');
        super(issueCode, issuesModel, issueId);
        this.#issueDetails = issueDetails;
    }
    getCategory() {
        return IssueCategory.Generic;
    }
    primaryKey() {
        return `${this.code()}-(${this.#issueDetails.frameId})`;
    }
    getDescription() {
        const description = issueDescriptions.get(this.#issueDetails.errorType);
        if (!description) {
            return null;
        }
        return resolveLazyDescription(description);
    }
    details() {
        return this.#issueDetails;
    }
    getKind() {
        return IssueKind.Improvement;
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const genericDetails = inspectorIssue.details.genericIssueDetails;
        if (!genericDetails) {
            console.warn('Generic issue without details received.');
            return [];
        }
        return [new GenericIssue(genericDetails, issuesModel, inspectorIssue.issueId)];
    }
}
export const genericCrossOriginPortalPostMessageError = {
    file: 'genericCrossOriginPortalPostMessageError.md',
    links: [{
            link: 'https://github.com/WICG/portals#same-origin-communication-channels',
            linkTitle: i18nLazyString(UIStrings.crossOriginPortalPostMessage),
        }],
};
export const genericCrossOriginPortalPostMessageCode = [
    "GenericIssue" /* GenericIssue */,
    "CrossOriginPortalPostMessageError" /* CrossOriginPortalPostMessageError */,
].join('::');
const issueDescriptions = new Map([
    ["CrossOriginPortalPostMessageError" /* CrossOriginPortalPostMessageError */, genericCrossOriginPortalPostMessageError],
]);
//# sourceMappingURL=GenericIssue.js.map
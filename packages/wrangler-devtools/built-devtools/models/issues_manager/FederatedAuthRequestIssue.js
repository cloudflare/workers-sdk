// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import { resolveLazyDescription } from './MarkdownIssueDescription.js';
const UIStrings = {
    /**
    *@description Title for Client Hint specification url link
    */
    fedCm: 'Federated Credential Management API',
};
const str_ = i18n.i18n.registerUIStrings('models/issues_manager/FederatedAuthRequestIssue.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
export class FederatedAuthRequestIssue extends Issue {
    #issueDetails;
    constructor(issueDetails, issuesModel) {
        super({
            code: "FederatedAuthRequestIssue" /* FederatedAuthRequestIssue */,
            umaCode: [
                "FederatedAuthRequestIssue" /* FederatedAuthRequestIssue */,
                issueDetails.federatedAuthRequestIssueReason,
            ].join('::'),
        }, issuesModel);
        this.#issueDetails = issueDetails;
    }
    getCategory() {
        return IssueCategory.Other;
    }
    details() {
        return this.#issueDetails;
    }
    getDescription() {
        const description = issueDescriptions.get(this.#issueDetails.federatedAuthRequestIssueReason);
        if (!description) {
            return null;
        }
        return resolveLazyDescription(description);
    }
    primaryKey() {
        return JSON.stringify(this.#issueDetails);
    }
    getKind() {
        return IssueKind.PageError;
    }
    static fromInspectorIssue(issuesModel, inspectorIssue) {
        const details = inspectorIssue.details.federatedAuthRequestIssueDetails;
        if (!details) {
            console.warn('Federated auth request issue without details received.');
            return [];
        }
        return [new FederatedAuthRequestIssue(details, issuesModel)];
    }
}
const issueDescriptions = new Map([
    [
        "ApprovalDeclined" /* ApprovalDeclined */,
        {
            file: 'federatedAuthRequestApprovalDeclined.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "TooManyRequests" /* TooManyRequests */,
        {
            file: 'federatedAuthRequestTooManyRequests.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "ManifestHttpNotFound" /* ManifestHttpNotFound */,
        {
            file: 'federatedAuthRequestManifestHttpNotFound.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "ManifestNoResponse" /* ManifestNoResponse */,
        {
            file: 'federatedAuthRequestManifestNoResponse.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "ManifestInvalidResponse" /* ManifestInvalidResponse */,
        {
            file: 'federatedAuthRequestManifestInvalidResponse.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "ClientMetadataHttpNotFound" /* ClientMetadataHttpNotFound */,
        {
            file: 'federatedAuthRequestClientMetadataHttpNotFound.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "ClientMetadataNoResponse" /* ClientMetadataNoResponse */,
        {
            file: 'federatedAuthRequestClientMetadataNoResponse.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "ClientMetadataInvalidResponse" /* ClientMetadataInvalidResponse */,
        {
            file: 'federatedAuthRequestClientMetadataInvalidResponse.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "ErrorFetchingSignin" /* ErrorFetchingSignin */,
        {
            file: 'federatedAuthRequestErrorFetchingSignin.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "InvalidSigninResponse" /* InvalidSigninResponse */,
        {
            file: 'federatedAuthRequestInvalidSigninResponse.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "AccountsHttpNotFound" /* AccountsHttpNotFound */,
        {
            file: 'federatedAuthRequestAccountsHttpNotFound.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "AccountsNoResponse" /* AccountsNoResponse */,
        {
            file: 'federatedAuthRequestAccountsNoResponse.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "AccountsInvalidResponse" /* AccountsInvalidResponse */,
        {
            file: 'federatedAuthRequestAccountsInvalidResponse.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "IdTokenHttpNotFound" /* IdTokenHttpNotFound */,
        {
            file: 'federatedAuthRequestIdTokenHttpNotFound.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "IdTokenNoResponse" /* IdTokenNoResponse */,
        {
            file: 'federatedAuthRequestIdTokenNoResponse.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "IdTokenInvalidResponse" /* IdTokenInvalidResponse */,
        {
            file: 'federatedAuthRequestIdTokenInvalidResponse.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "IdTokenInvalidRequest" /* IdTokenInvalidRequest */,
        {
            file: 'federatedAuthRequestIdTokenInvalidRequest.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "ErrorIdToken" /* ErrorIdToken */,
        {
            file: 'federatedAuthRequestErrorIdToken.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
    [
        "Canceled" /* Canceled */,
        {
            file: 'federatedAuthRequestCanceled.md',
            links: [{
                    link: 'https://fedidcg.github.io/FedCM/',
                    linkTitle: i18nLazyString(UIStrings.fedCm),
                }],
        },
    ],
]);
//# sourceMappingURL=FederatedAuthRequestIssue.js.map
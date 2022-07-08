import type * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import type { MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare enum IssueCode {
    InsecurePrivateNetwork = "CorsIssue::InsecurePrivateNetwork",
    InvalidHeaderValues = "CorsIssue::InvalidHeaders",
    WildcardOriginNotAllowed = "CorsIssue::WildcardOriginWithCredentials",
    PreflightResponseInvalid = "CorsIssue::PreflightResponseInvalid",
    OriginMismatch = "CorsIssue::OriginMismatch",
    AllowCredentialsRequired = "CorsIssue::AllowCredentialsRequired",
    MethodDisallowedByPreflightResponse = "CorsIssue::MethodDisallowedByPreflightResponse",
    HeaderDisallowedByPreflightResponse = "CorsIssue::HeaderDisallowedByPreflightResponse",
    RedirectContainsCredentials = "CorsIssue::RedirectContainsCredentials",
    DisallowedByMode = "CorsIssue::DisallowedByMode",
    CorsDisabledScheme = "CorsIssue::CorsDisabledScheme",
    PreflightMissingAllowExternal = "CorsIssue::PreflightMissingAllowExternal",
    PreflightInvalidAllowExternal = "CorsIssue::PreflightInvalidAllowExternal",
    NoCorsRedirectModeNotFollow = "CorsIssue::NoCorsRedirectModeNotFollow",
    InvalidPrivateNetworkAccess = "CorsIssue::InvalidPrivateNetworkAccess",
    UnexpectedPrivateNetworkAccess = "CorsIssue::UnexpectedPrivateNetworkAccess",
    PreflightAllowPrivateNetworkError = "CorsIssue::PreflightAllowPrivateNetworkError"
}
export declare class CorsIssue extends Issue<IssueCode> {
    #private;
    constructor(issueDetails: Protocol.Audits.CorsIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel, issueId: Protocol.Audits.IssueId | undefined);
    getCategory(): IssueCategory;
    details(): Protocol.Audits.CorsIssueDetails;
    getDescription(): MarkdownIssueDescription | null;
    primaryKey(): string;
    getKind(): IssueKind;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel, inspectorIssue: Protocol.Audits.InspectorIssue): CorsIssue[];
}

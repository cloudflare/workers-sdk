import * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import type { MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare class CookieIssue extends Issue {
    #private;
    constructor(code: string, issueDetails: Protocol.Audits.CookieIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel);
    primaryKey(): string;
    /**
     * Returns an array of issues from a given CookieIssueDetails.
     */
    static createIssuesFromCookieIssueDetails(cookieIssueDetails: Protocol.Audits.CookieIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel): CookieIssue[];
    /**
     * Calculates an issue code from a reason, an operation, and an array of warningReasons. All these together
     * can uniquely identify a specific cookie issue.
     * warningReasons is only needed for some CookieExclusionReason in order to determine if an issue should be raised.
     * It is not required if reason is a CookieWarningReason.
     */
    static codeForCookieIssueDetails(reason: Protocol.Audits.CookieExclusionReason | Protocol.Audits.CookieWarningReason, warningReasons: Protocol.Audits.CookieWarningReason[], operation: Protocol.Audits.CookieOperation, cookieUrl?: string): string | null;
    cookies(): Iterable<Protocol.Audits.AffectedCookie>;
    rawCookieLines(): Iterable<string>;
    requests(): Iterable<Protocol.Audits.AffectedRequest>;
    getCategory(): IssueCategory;
    getDescription(): MarkdownIssueDescription | null;
    isCausedByThirdParty(): boolean;
    getKind(): IssueKind;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel, inspectorIssue: Protocol.Audits.InspectorIssue): CookieIssue[];
}
/**
 * Exported for unit test.
 */
export declare function isCausedByThirdParty(topFrame: SDK.ResourceTreeModel.ResourceTreeFrame | null, cookieUrl?: string): boolean;

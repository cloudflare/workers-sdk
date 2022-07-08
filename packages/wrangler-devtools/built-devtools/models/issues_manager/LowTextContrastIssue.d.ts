import type * as SDK from '../../core/sdk/sdk.js';
import type * as Protocol from '../../generated/protocol.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import type { MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare class LowTextContrastIssue extends Issue {
    #private;
    constructor(issueDetails: Protocol.Audits.LowTextContrastIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel);
    primaryKey(): string;
    getCategory(): IssueCategory;
    details(): Protocol.Audits.LowTextContrastIssueDetails;
    getDescription(): MarkdownIssueDescription;
    getKind(): IssueKind;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel, inspectorIssue: Protocol.Audits.InspectorIssue): LowTextContrastIssue[];
}

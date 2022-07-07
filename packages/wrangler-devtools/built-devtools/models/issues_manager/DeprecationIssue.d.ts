import type * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import type { MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare class DeprecationIssue extends Issue {
    #private;
    constructor(issueDetails: Protocol.Audits.DeprecationIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel);
    getCategory(): IssueCategory;
    details(): Protocol.Audits.DeprecationIssueDetails;
    getDescription(): MarkdownIssueDescription;
    sources(): Iterable<Protocol.Audits.SourceCodeLocation>;
    primaryKey(): string;
    getKind(): IssueKind;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel, inspectorIssue: Protocol.Audits.InspectorIssue): DeprecationIssue[];
}

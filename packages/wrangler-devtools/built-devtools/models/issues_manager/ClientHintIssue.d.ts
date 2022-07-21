import type * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import { Issue, IssueCategory, IssueKind } from './Issue.js';
import type { MarkdownIssueDescription } from './MarkdownIssueDescription.js';
export declare class ClientHintIssue extends Issue {
    private issueDetails;
    constructor(issueDetails: Protocol.Audits.ClientHintIssueDetails, issuesModel: SDK.IssuesModel.IssuesModel);
    getCategory(): IssueCategory;
    details(): Protocol.Audits.ClientHintIssueDetails;
    getDescription(): MarkdownIssueDescription | null;
    sources(): Iterable<Protocol.Audits.SourceCodeLocation>;
    primaryKey(): string;
    getKind(): IssueKind;
    static fromInspectorIssue(issuesModel: SDK.IssuesModel.IssuesModel, inspectorIssue: Protocol.Audits.InspectorIssue): ClientHintIssue[];
}

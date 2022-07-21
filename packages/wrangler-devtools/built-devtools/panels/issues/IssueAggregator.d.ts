import * as Common from '../../core/common/common.js';
import * as IssuesManager from '../../models/issues_manager/issues_manager.js';
import type * as Protocol from '../../generated/protocol.js';
declare type AggregationKeyTag = {
    aggregationKeyTag: undefined;
};
/**
 * An opaque type for the key which we use to aggregate issues. The key must be
 * chosen such that if two aggregated issues have the same aggregation key, then
 * they also have the same issue code.
 */
export declare type AggregationKey = {
    toString(): string;
} & AggregationKeyTag;
/**
 * An `AggregatedIssue` representes a number of `IssuesManager.Issue.Issue` objects that are displayed together.
 * Currently only grouping by issue code, is supported. The class provides helpers to support displaying
 * of all resources that are affected by the aggregated issues.
 */
export declare class AggregatedIssue extends IssuesManager.Issue.Issue {
    #private;
    constructor(code: string, aggregationKey: AggregationKey);
    primaryKey(): string;
    aggregationKey(): AggregationKey;
    getBlockedByResponseDetails(): Iterable<Protocol.Audits.BlockedByResponseIssueDetails>;
    cookies(): Iterable<Protocol.Audits.AffectedCookie>;
    getRawCookieLines(): Iterable<{
        rawCookieLine: string;
        hasRequest: boolean;
    }>;
    sources(): Iterable<Protocol.Audits.SourceCodeLocation>;
    cookiesWithRequestIndicator(): Iterable<{
        cookie: Protocol.Audits.AffectedCookie;
        hasRequest: boolean;
    }>;
    getHeavyAdIssues(): Iterable<IssuesManager.HeavyAdIssue.HeavyAdIssue>;
    getMixedContentIssues(): Iterable<IssuesManager.MixedContentIssue.MixedContentIssue>;
    getTrustedWebActivityIssues(): Iterable<IssuesManager.TrustedWebActivityIssue.TrustedWebActivityIssue>;
    getCorsIssues(): Set<IssuesManager.CorsIssue.CorsIssue>;
    getCspIssues(): Iterable<IssuesManager.ContentSecurityPolicyIssue.ContentSecurityPolicyIssue>;
    getDeprecationIssues(): Iterable<IssuesManager.DeprecationIssue.DeprecationIssue>;
    getLowContrastIssues(): Iterable<IssuesManager.LowTextContrastIssue.LowTextContrastIssue>;
    requests(): Iterable<Protocol.Audits.AffectedRequest>;
    getSharedArrayBufferIssues(): Iterable<IssuesManager.SharedArrayBufferIssue.SharedArrayBufferIssue>;
    getQuirksModeIssues(): Iterable<IssuesManager.QuirksModeIssue.QuirksModeIssue>;
    getAttributionReportingIssues(): ReadonlySet<IssuesManager.AttributionReportingIssue.AttributionReportingIssue>;
    getGenericIssues(): ReadonlySet<IssuesManager.GenericIssue.GenericIssue>;
    getDescription(): IssuesManager.MarkdownIssueDescription.MarkdownIssueDescription | null;
    getCategory(): IssuesManager.Issue.IssueCategory;
    getAggregatedIssuesCount(): number;
    addInstance(issue: IssuesManager.Issue.Issue): void;
    getKind(): IssuesManager.Issue.IssueKind;
    isHidden(): boolean;
    setHidden(_value: boolean): void;
}
export declare class IssueAggregator extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    private readonly issuesManager;
    constructor(issuesManager: IssuesManager.IssuesManager.IssuesManager);
    aggregatedIssues(): Iterable<AggregatedIssue>;
    hiddenAggregatedIssues(): Iterable<AggregatedIssue>;
    aggregatedIssueCodes(): Set<AggregationKey>;
    aggregatedIssueCategories(): Set<IssuesManager.Issue.IssueCategory>;
    aggregatedIssueKinds(): Set<IssuesManager.Issue.IssueKind>;
    numberOfAggregatedIssues(): number;
    numberOfHiddenAggregatedIssues(): number;
    keyForIssue(issue: IssuesManager.Issue.Issue<string>): AggregationKey;
}
export declare const enum Events {
    AggregatedIssueUpdated = "AggregatedIssueUpdated",
    FullUpdateRequired = "FullUpdateRequired"
}
export declare type EventTypes = {
    [Events.AggregatedIssueUpdated]: AggregatedIssue;
    [Events.FullUpdateRequired]: void;
};
export {};

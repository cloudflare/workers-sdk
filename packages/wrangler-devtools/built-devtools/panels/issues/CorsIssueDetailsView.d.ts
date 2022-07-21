import * as Platform from '../../core/platform/platform.js';
import { AffectedResourcesView } from './AffectedResourcesView.js';
import type { AggregatedIssue } from './IssueAggregator.js';
import type { IssueView } from './IssueView.js';
export declare class CorsIssueDetailsView extends AffectedResourcesView {
    #private;
    constructor(parent: IssueView, issue: AggregatedIssue);
    protected getResourceNameWithCount(count: number): Platform.UIString.LocalizedString;
    private static getHeaderFromError;
    private static getProblemFromError;
    update(): void;
}

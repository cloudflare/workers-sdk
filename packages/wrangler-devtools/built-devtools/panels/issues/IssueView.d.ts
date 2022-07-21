import * as IssuesManager from '../../models/issues_manager/issues_manager.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { AggregatedIssue } from './IssueAggregator.js';
export declare class IssueView extends UI.TreeOutline.TreeElement {
    #private;
    toggleOnClick: boolean;
    affectedResources: UI.TreeOutline.TreeElement;
    constructor(issue: AggregatedIssue, description: IssuesManager.MarkdownIssueDescription.IssueDescription);
    /**
     * Sets the issue to take the resources from. Assumes that the description
     * this IssueView was initialized with fits the new issue as well, i.e.
     * title and issue description will not be updated.
     */
    setIssue(issue: AggregatedIssue): void;
    private static getBodyCSSClass;
    getIssueTitle(): string;
    onattach(): void;
    createContent(): void;
    appendAffectedResource(resource: UI.TreeOutline.TreeElement): void;
    onexpand(): void;
    updateAffectedResourceVisibility(): void;
    update(): void;
    getIssueKind(): IssuesManager.Issue.IssueKind;
    isForHiddenIssue(): boolean;
    toggle(expand?: boolean): void;
}

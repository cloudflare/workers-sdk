import * as IssuesManager from '../../../models/issues_manager/issues_manager.js';
import type * as IconButton from '../icon_button/icon_button.js';
export declare function getIssueKindIconData(issueKind: IssuesManager.Issue.IssueKind): IconButton.Icon.IconWithName;
export declare const enum DisplayMode {
    OmitEmpty = "OmitEmpty",
    ShowAlways = "ShowAlways",
    OnlyMostImportant = "OnlyMostImportant"
}
export interface IssueCounterData {
    clickHandler?: () => void;
    tooltipCallback?: () => void;
    leadingText?: string;
    displayMode?: DisplayMode;
    issuesManager: IssuesManager.IssuesManager.IssuesManager;
    throttlerTimeout?: number;
    accessibleName?: string;
    compact?: boolean;
}
export declare function getIssueCountsEnumeration(issuesManager: IssuesManager.IssuesManager.IssuesManager, omitEmpty?: boolean): string;
export declare class IssueCounter extends HTMLElement {
    #private;
    static readonly litTagName: import("../../lit-html/static.js").Static;
    scheduleUpdate(): void;
    connectedCallback(): void;
    set data(data: IssueCounterData);
    get data(): IssueCounterData;
}
declare global {
    interface HTMLElementTagNameMap {
        'issue-counter': IssueCounter;
    }
}

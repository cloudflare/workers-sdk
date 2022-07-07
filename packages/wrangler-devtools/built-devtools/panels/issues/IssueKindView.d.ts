import * as Common from '../../core/common/common.js';
import * as IssuesManager from '../../models/issues_manager/issues_manager.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare function getGroupIssuesByKindSetting(): Common.Settings.Setting<boolean>;
export declare function issueKindViewSortPriority(a: IssueKindView, b: IssueKindView): number;
export declare function getClassNameFromKind(kind: IssuesManager.Issue.IssueKind): string;
export declare class IssueKindView extends UI.TreeOutline.TreeElement {
    #private;
    constructor(kind: IssuesManager.Issue.IssueKind);
    getKind(): IssuesManager.Issue.IssueKind;
    getHideAllCurrentKindString(): Common.UIString.LocalizedString;
    onattach(): void;
    update(count: number): void;
}

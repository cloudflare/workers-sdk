import * as Common from '../../core/common/common.js';
import * as IssuesManager from '../../models/issues_manager/issues_manager.js';
import * as UI from '../../ui/legacy/legacy.js';
import { IssueView } from './IssueView.js';
export declare function getGroupIssuesByCategorySetting(): Common.Settings.Setting<boolean>;
export declare class IssuesPane extends UI.Widget.VBox {
    #private;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): IssuesPane;
    elementsToRestoreScrollPositionsFor(): Element[];
    appendIssueViewToParent(issueView: IssueView, parent: UI.TreeOutline.TreeOutline | UI.TreeOutline.TreeElement): void;
    reveal(issue: IssuesManager.Issue.Issue): Promise<void>;
    wasShown(): void;
}

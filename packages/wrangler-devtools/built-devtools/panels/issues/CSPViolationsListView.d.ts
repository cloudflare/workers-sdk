import * as IssuesManager from '../../models/issues_manager/issues_manager.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class CSPViolationsListView extends UI.Widget.VBox {
    #private;
    constructor();
    updateTextFilter(filter: string): void;
    updateCategoryFilter(categories: Set<string>): void;
    addIssue(issue: IssuesManager.ContentSecurityPolicyIssue.ContentSecurityPolicyIssue): void;
    clearIssues(): void;
    wasShown(): void;
}

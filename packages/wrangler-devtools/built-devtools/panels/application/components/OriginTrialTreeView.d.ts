import * as Protocol from '../../../generated/protocol.js';
import * as TreeOutline from '../../../ui/components/tree_outline/tree_outline.js';
export interface BadgeData {
    badgeContent: string;
    style: 'error' | 'success' | 'secondary';
}
export declare class Badge extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    set data(data: BadgeData);
    connectedCallback(): void;
}
declare type TreeNode<DataType> = TreeOutline.TreeOutlineUtils.TreeNode<DataType>;
export declare type OriginTrialTreeNodeData = Protocol.Page.OriginTrial | Protocol.Page.OriginTrialTokenWithStatus | string;
export interface OriginTrialTokenRowsData {
    node: TreeNode<OriginTrialTreeNodeData>;
}
export declare class OriginTrialTokenRows extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    set data(data: OriginTrialTokenRowsData);
    connectedCallback(): void;
}
export interface OriginTrialTreeViewData {
    trials: Protocol.Page.OriginTrial[];
}
export declare class OriginTrialTreeView extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    set data(data: OriginTrialTreeViewData);
    connectedCallback(): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-resources-origin-trial-tree-view': OriginTrialTreeView;
        'devtools-resources-origin-trial-token-rows': OriginTrialTokenRows;
        'devtools-resources-origin-trial-tree-view-badge': Badge;
    }
}
export {};

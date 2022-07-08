import * as LitHtml from '../../lit-html/lit-html.js';
import type { TreeNodeId, TreeNode } from './TreeOutlineUtils.js';
export interface TreeOutlineData<TreeNodeDataType> {
    defaultRenderer: (node: TreeNode<TreeNodeDataType>, state: {
        isExpanded: boolean;
    }) => LitHtml.TemplateResult;
    /**
     * Note: it is important that all the TreeNode objects are unique. They are
     * used internally to the TreeOutline as keys to track state (such as if a
     * node is expanded or not), and providing the same object multiple times will
     * cause issues in the TreeOutline.
     */
    tree: readonly TreeNode<TreeNodeDataType>[];
    filter?: (node: TreeNodeDataType) => FilterOption;
    compact?: boolean;
}
export declare function defaultRenderer(node: TreeNode<string>): LitHtml.TemplateResult;
export declare class ItemSelectedEvent<TreeNodeDataType> extends Event {
    static readonly eventName = "itemselected";
    data: {
        node: TreeNode<TreeNodeDataType>;
    };
    constructor(node: TreeNode<TreeNodeDataType>);
}
export declare class ItemMouseOverEvent<TreeNodeDataType> extends Event {
    static readonly eventName = "itemmouseover";
    data: {
        node: TreeNode<TreeNodeDataType>;
    };
    constructor(node: TreeNode<TreeNodeDataType>);
}
export declare class ItemMouseOutEvent<TreeNodeDataType> extends Event {
    static readonly eventName = "itemmouseout";
    data: {
        node: TreeNode<TreeNodeDataType>;
    };
    constructor(node: TreeNode<TreeNodeDataType>);
}
/**
 *
 * The tree can be filtered by providing a custom filter function.
 * The filter is applied on every node when constructing the tree
 * and proceeds as follows:
 * - If the filter return SHOW for a node, the node is included in the tree.
 * - If the filter returns FLATTEN, the node is ignored but its subtree is included.
 */
export declare const enum FilterOption {
    SHOW = "SHOW",
    FLATTEN = "FLATTEN"
}
export declare class TreeOutline<TreeNodeDataType> extends HTMLElement {
    #private;
    static readonly litTagName: import("../../lit-html/static.js").Static;
    static get observedAttributes(): string[];
    attributeChangedCallback(name: 'nowrap' | 'toplevelbordercolor', oldValue: string | null, newValue: string | null): void;
    connectedCallback(): void;
    get data(): TreeOutlineData<TreeNodeDataType>;
    set data(data: TreeOutlineData<TreeNodeDataType>);
    /**
     * Recursively expands the tree from the root nodes, to a max depth. The max
     * depth is 0 indexed - so a maxDepth of 2 (default) will expand 3 levels: 0,
     * 1 and 2.
     */
    expandRecursively(maxDepth?: number): Promise<void>;
    /**
     * Collapses all nodes in the tree.
     */
    collapseAllNodes(): Promise<void>;
    /**
     * Takes a TreeNode, expands the outline to reveal it, and focuses it.
     */
    expandToAndSelectTreeNode(targetTreeNode: TreeNode<TreeNodeDataType>): Promise<void>;
    /**
     * Takes a TreeNode ID, expands the outline to reveal it, and focuses it.
     */
    expandToAndSelectTreeNodeId(targetTreeNodeId: TreeNodeId): Promise<void>;
    /**
     * Takes a list of TreeNode IDs and expands the corresponding nodes.
     */
    expandNodeIds(nodeIds: TreeNodeId[]): Promise<void>;
    /**
     * Takes a TreeNode ID and focuses the corresponding node.
     */
    focusNodeId(nodeId: TreeNodeId): Promise<void>;
    collapseChildrenOfNode(domNode: HTMLLIElement): Promise<void>;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-tree-outline': TreeOutline<unknown>;
    }
}

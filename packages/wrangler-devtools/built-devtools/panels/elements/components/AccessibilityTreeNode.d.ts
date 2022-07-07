import * as Protocol from '../../../generated/protocol.js';
export interface AccessibilityTreeNodeData {
    ignored: boolean;
    name: string;
    role: string;
    properties: Protocol.Accessibility.AXProperty[];
}
export declare class AccessibilityTreeNode extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    set data(data: AccessibilityTreeNodeData);
    connectedCallback(): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-accessibility-tree-node': AccessibilityTreeNode;
    }
}

export interface NodeTextData {
    nodeTitle: string;
    nodeId?: string;
    nodeClasses?: string[];
}
export declare class NodeText extends HTMLElement {
    #private;
    static readonly litTagName: import("../../lit-html/static.js").Static;
    connectedCallback(): void;
    set data(data: NodeTextData);
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-node-text': NodeText;
    }
}

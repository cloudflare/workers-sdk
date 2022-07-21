import type * as SDK from '../../../core/sdk/sdk.js';
import type { DOMNode } from './Helper.js';
export declare class NodeSelectedEvent extends Event {
    static readonly eventName = "breadcrumbsnodeselected";
    legacyDomNode: SDK.DOMModel.DOMNode;
    constructor(node: DOMNode);
}
export interface ElementsBreadcrumbsData {
    selectedNode: DOMNode | null;
    crumbs: DOMNode[];
}
export declare class ElementsBreadcrumbs extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    connectedCallback(): void;
    set data(data: ElementsBreadcrumbsData);
    disconnectedCallback(): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-elements-breadcrumbs': ElementsBreadcrumbs;
    }
    interface HTMLElementEventMap {
        [NodeSelectedEvent.eventName]: NodeSelectedEvent;
    }
}

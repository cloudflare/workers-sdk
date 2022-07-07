export interface ElementsPanelLinkData {
    onElementRevealIconClick: (event?: Event) => void;
    onElementRevealIconMouseEnter: (event?: Event) => void;
    onElementRevealIconMouseLeave: (event?: Event) => void;
}
export declare class ElementsPanelLink extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    set data(data: ElementsPanelLinkData);
    connectedCallback(): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-elements-panel-link': ElementsPanelLink;
    }
}

export declare class OverviewStartRequestedEvent extends Event {
    static readonly eventName = "overviewstartrequested";
    constructor();
}
export declare class CSSOverviewStartView extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    connectedCallback(): void;
    show(): void;
    hide(): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-css-overview-start-view': CSSOverviewStartView;
    }
}

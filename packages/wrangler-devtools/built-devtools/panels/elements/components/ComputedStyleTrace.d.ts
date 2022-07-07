export interface ComputedStyleTraceData {
    selector: string;
    active: boolean;
    onNavigateToSource: (event?: Event) => void;
    ruleOriginNode?: Node;
}
export declare class ComputedStyleTrace extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    connectedCallback(): void;
    set data(data: ComputedStyleTraceData);
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-computed-style-trace': ComputedStyleTrace;
    }
}

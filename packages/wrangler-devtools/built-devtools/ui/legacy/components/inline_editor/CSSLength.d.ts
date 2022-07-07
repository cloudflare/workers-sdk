export declare class DraggingFinishedEvent extends Event {
    static readonly eventName = "draggingfinished";
    constructor();
}
export interface CSSLengthData {
    lengthText: string;
}
export declare class CSSLength extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../lit-html/static.js").Static;
    private readonly shadow;
    private readonly onDraggingValue;
    private length;
    private isEditingSlot;
    private isDraggingValue;
    private currentMouseClientX;
    set data(data: CSSLengthData);
    connectedCallback(): void;
    private onUnitChange;
    private dragValue;
    private onValueMousedown;
    private onValueMouseup;
    private onUnitMouseup;
    private render;
    private renderContent;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-css-length': CSSLength;
    }
}

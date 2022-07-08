export declare class PopoverToggledEvent extends Event {
    static readonly eventName = "popovertoggled";
    data: {
        open: boolean;
    };
    constructor(open: boolean);
}
export declare class UnitChangedEvent extends Event {
    static readonly eventName = "unitchanged";
    data: {
        value: string;
    };
    constructor(value: string);
}
export interface CSSAngleData {
    propertyName: string;
    propertyValue: string;
    angleText: string;
    containingPane: HTMLElement;
}
export declare class CSSAngle extends HTMLElement {
    static readonly litTagName: import("../../../lit-html/static.js").Static;
    private readonly shadow;
    private angle;
    private displayedAngle;
    private propertyName;
    private propertyValue;
    private containingPane?;
    private angleElement;
    private swatchElement;
    private popoverOpen;
    private popoverStyleTop;
    private popoverStyleLeft;
    private onMinifyingAction;
    connectedCallback(): void;
    set data(data: CSSAngleData);
    disconnectedCallback(): void;
    popover(): void;
    minify(): void;
    updateProperty(name: string, value: string): void;
    private updateAngle;
    private displayNextUnit;
    private bindMinifyingAction;
    private unbindMinifyingAction;
    private onMiniIconClick;
    private consume;
    private onKeydown;
    private render;
    private renderPopover;
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-css-angle': CSSAngle;
    }
}

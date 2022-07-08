import type { Size } from './Geometry.js';
import type { WidgetElement } from './Widget.js';
import { Widget } from './Widget.js';
export declare class GlassPane {
    private readonly widgetInternal;
    element: WidgetElement;
    contentElement: HTMLDivElement;
    private readonly arrowElement;
    private readonly onMouseDownBound;
    private onClickOutsideCallback;
    private maxSize;
    private positionX;
    private positionY;
    private anchorBox;
    private anchorBehavior;
    private sizeBehavior;
    private marginBehavior;
    constructor();
    isShowing(): boolean;
    registerRequiredCSS(cssFile: {
        cssContent: string;
    }): void;
    registerCSSFiles(cssFiles: CSSStyleSheet[]): void;
    setDefaultFocusedElement(element: Element | null): void;
    setDimmed(dimmed: boolean): void;
    setPointerEventsBehavior(pointerEventsBehavior: PointerEventsBehavior): void;
    setOutsideClickCallback(callback: ((arg0: Event) => void) | null): void;
    setMaxContentSize(size: Size | null): void;
    setSizeBehavior(sizeBehavior: SizeBehavior): void;
    setContentPosition(x: number | null, y: number | null): void;
    setContentAnchorBox(anchorBox: AnchorBox | null): void;
    setAnchorBehavior(behavior: AnchorBehavior): void;
    setMarginBehavior(behavior: MarginBehavior): void;
    show(document: Document): void;
    hide(): void;
    private onMouseDown;
    positionContent(): void;
    widget(): Widget;
    static setContainer(element: Element): void;
    static container(document: Document): Element;
    static containerMoved(element: Element): void;
}
export declare const enum PointerEventsBehavior {
    BlockedByGlassPane = "BlockedByGlassPane",
    PierceGlassPane = "PierceGlassPane",
    PierceContents = "PierceContents"
}
export declare const enum AnchorBehavior {
    PreferTop = "PreferTop",
    PreferBottom = "PreferBottom",
    PreferLeft = "PreferLeft",
    PreferRight = "PreferRight"
}
export declare const enum SizeBehavior {
    SetExactSize = "SetExactSize",
    SetExactWidthMaxHeight = "SetExactWidthMaxHeight",
    MeasureContent = "MeasureContent"
}
export declare const enum MarginBehavior {
    Arrow = "Arrow",
    DefaultMargin = "DefaultMargin",
    NoMargin = "NoMargin"
}
export declare const GlassPanePanes: Set<GlassPane>;

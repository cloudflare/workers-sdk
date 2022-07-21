import { XElement } from './XElement.js';
export declare class XWidget extends XElement {
    private visible;
    private readonly shadowRootInternal;
    private defaultFocusedElement;
    private elementsToRestoreScrollPositionsFor;
    private onShownCallback;
    private onHiddenCallback;
    private onResizedCallback;
    constructor();
    isShowing(): boolean;
    setOnShown(callback: (() => void) | null): void;
    setOnHidden(callback: (() => void) | null): void;
    setOnResized(callback: (() => void) | null): void;
    setElementsToRestoreScrollPositionsFor(elements: Element[]): void;
    restoreScrollPositions(): void;
    private static storeScrollPosition;
    setDefaultFocusedElement(element: Element | null): void;
    focus(): void;
    connectedCallback(): void;
    disconnectedCallback(): void;
}

import type { ListModel } from './ListModel.js';
export interface ListDelegate<T> {
    createElementForItem(item: T): Element;
    /**
     * This method is not called in NonViewport mode.
     * Return zero to make list measure the item (only works in SameHeight mode).
     */
    heightForItem(item: T): number;
    isItemSelectable(item: T): boolean;
    selectedItemChanged(from: T | null, to: T | null, fromElement: HTMLElement | null, toElement: HTMLElement | null): void;
    updateSelectedItemARIA(fromElement: Element | null, toElement: Element | null): boolean;
}
export declare enum ListMode {
    NonViewport = "UI.ListMode.NonViewport",
    EqualHeightItems = "UI.ListMode.EqualHeightItems",
    VariousHeightItems = "UI.ListMode.VariousHeightItems"
}
export declare class ListControl<T> {
    element: HTMLDivElement;
    private topElement;
    private bottomElement;
    private firstIndex;
    private lastIndex;
    private renderedHeight;
    private topHeight;
    private bottomHeight;
    private model;
    private itemToElement;
    private selectedIndexInternal;
    private selectedItemInternal;
    private delegate;
    private readonly mode;
    private fixedHeight;
    private variableOffsets;
    constructor(model: ListModel<T>, delegate: ListDelegate<T>, mode?: ListMode);
    setModel(model: ListModel<T>): void;
    private replacedItemsInRange;
    refreshItem(item: T): void;
    refreshItemByIndex(index: number): void;
    refreshAllItems(): void;
    invalidateRange(from: number, to: number): void;
    viewportResized(): void;
    invalidateItemHeight(): void;
    itemForNode(node: Node | null): T | null;
    scrollItemIntoView(item: T, center?: boolean): void;
    selectedItem(): T | null;
    selectedIndex(): number;
    selectItem(item: T | null, center?: boolean, dontScroll?: boolean): void;
    selectPreviousItem(canWrap?: boolean, center?: boolean): boolean;
    selectNextItem(canWrap?: boolean, center?: boolean): boolean;
    selectItemPreviousPage(center?: boolean): boolean;
    selectItemNextPage(center?: boolean): boolean;
    private scrollIntoView;
    private onClick;
    private onKeyDown;
    private totalHeight;
    private indexAtOffset;
    private elementAtIndex;
    private refreshARIA;
    private updateElementARIA;
    private offsetAtIndex;
    private measureHeight;
    private select;
    private findFirstSelectable;
    private findPageSelectable;
    private reallocateVariableOffsets;
    private invalidate;
    private invalidateNonViewportMode;
    private clearViewport;
    private clearContents;
    private updateViewport;
}

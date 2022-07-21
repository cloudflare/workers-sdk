import type * as Common from '../../core/common/common.js';
import type { ListDelegate } from './ListControl.js';
import type { ListModel } from './ListModel.js';
export declare class SoftDropDown<T> implements ListDelegate<T> {
    private delegate;
    private selectedItem;
    private readonly model;
    private placeholderText;
    element: HTMLButtonElement;
    private titleElement;
    private readonly glassPane;
    private list;
    private rowHeight;
    private width;
    private listWasShowing200msAgo;
    constructor(model: ListModel<T>, delegate: Delegate<T>);
    private show;
    private updateGlasspaneSize;
    private hide;
    private onKeyDownButton;
    private onKeyDownList;
    setWidth(width: number): void;
    setRowHeight(rowHeight: number): void;
    setPlaceholderText(text: Common.UIString.LocalizedString): void;
    private itemsReplaced;
    selectItem(item: T | null): void;
    createElementForItem(item: T): Element;
    heightForItem(_item: T): number;
    isItemSelectable(item: T): boolean;
    selectedItemChanged(from: T | null, to: T | null, fromElement: Element | null, toElement: Element | null): void;
    updateSelectedItemARIA(_fromElement: Element | null, _toElement: Element | null): boolean;
    private selectHighlightedItem;
    refreshItem(item: T): void;
}
export interface Delegate<T> {
    titleFor(item: T): string;
    createElementForItem(item: T): Element;
    isItemSelectable(item: T): boolean;
    itemSelected(item: T | null): void;
    highlightedItemChanged(from: T | null, to: T | null, fromElement: Element | null, toElement: Element | null): void;
}

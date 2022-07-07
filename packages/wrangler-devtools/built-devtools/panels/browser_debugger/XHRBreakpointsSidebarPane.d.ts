import * as UI from '../../ui/legacy/legacy.js';
export declare class XHRBreakpointsSidebarPane extends UI.Widget.VBox implements UI.ContextFlavorListener.ContextFlavorListener, UI.Toolbar.ItemsProvider, UI.ListControl.ListDelegate<string> {
    #private;
    private constructor();
    static instance(): XHRBreakpointsSidebarPane;
    toolbarItems(): UI.Toolbar.ToolbarItem[];
    private emptyElementContextMenu;
    private addButtonClicked;
    heightForItem(_item: string): number;
    isItemSelectable(_item: string): boolean;
    private setBreakpoint;
    createElementForItem(item: string): Element;
    selectedItemChanged(from: string | null, to: string | null, fromElement: HTMLElement | null, toElement: HTMLElement | null): void;
    updateSelectedItemARIA(_fromElement: Element | null, _toElement: Element | null): boolean;
    private removeBreakpoint;
    private addListElement;
    private removeListElement;
    private contextMenu;
    private checkboxClicked;
    private labelClicked;
    flavorChanged(_object: Object | null): void;
    private update;
    private restoreBreakpoints;
    wasShown(): void;
}

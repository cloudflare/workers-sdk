import * as Bindings from '../../models/bindings/bindings.js';
import * as TextUtils from '../../models/text_utils/text_utils.js';
import * as Workspace from '../../models/workspace/workspace.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class JavaScriptBreakpointsSidebarPane extends UI.ThrottledWidget.ThrottledWidget implements UI.ContextFlavorListener.ContextFlavorListener, UI.ListControl.ListDelegate<BreakpointItem> {
    private readonly breakpointManager;
    private breakpoints;
    private list;
    private readonly emptyElement;
    private constructor();
    static instance(): JavaScriptBreakpointsSidebarPane;
    private getBreakpointLocations;
    private hideList;
    private ensureListShown;
    private groupBreakpointLocationsById;
    private getLocationIdsByLineId;
    private getSelectedUILocation;
    private getContent;
    doUpdate(): Promise<void>;
    /**
     * If the number of breakpoint items is the same,
     * we expect only minor changes and it implies that only
     * few items should be updated
     */
    private setBreakpointItems;
    createElementForItem(item: BreakpointItem): Element;
    heightForItem(_item: BreakpointItem): number;
    isItemSelectable(_item: BreakpointItem): boolean;
    selectedItemChanged(_from: BreakpointItem | null, _to: BreakpointItem | null, fromElement: HTMLElement | null, toElement: HTMLElement | null): void;
    updateSelectedItemARIA(_fromElement: Element | null, _toElement: Element | null): boolean;
    private breakpointLocations;
    private breakpointLocationsForElement;
    private breakpointCheckboxClicked;
    private revealLocation;
    private breakpointContextMenu;
    private toggleAllBreakpointsInFile;
    private toggleAllBreakpoints;
    private removeAllBreakpoints;
    private removeOtherBreakpoints;
    flavorChanged(_object: Object | null): void;
    private didUpdateForTest;
    wasShown(): void;
}
declare class BreakpointItem {
    locations: BreakpointLocation[];
    text: TextUtils.Text.Text | null;
    isSelected: boolean;
    showColumn: boolean;
    constructor(locations: BreakpointLocation[], text: TextUtils.Text.Text | null, isSelected: boolean, showColumn: boolean);
    /**
     * Checks if this item has not changed compared with the other
     * Used to cache model items between re-renders
     */
    isSimilar(other: BreakpointItem): boolean | null;
}
export declare function retrieveLocationForElement(element: Element): Workspace.UISourceCode.UILocation | undefined;
export interface BreakpointLocation {
    breakpoint: Bindings.BreakpointManager.Breakpoint;
    uiLocation: Workspace.UISourceCode.UILocation;
}
export {};

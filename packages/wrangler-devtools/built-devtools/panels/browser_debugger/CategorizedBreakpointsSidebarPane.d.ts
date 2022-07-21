import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import type * as Protocol from '../../generated/protocol.js';
export declare abstract class CategorizedBreakpointsSidebarPane extends UI.Widget.VBox {
    #private;
    constructor(categories: string[], breakpoints: SDK.CategorizedBreakpoint.CategorizedBreakpoint[], viewId: string, detailsPausedReason: Protocol.Debugger.PausedEventReason);
    get categories(): Map<string, Item>;
    get breakpoints(): Map<SDK.CategorizedBreakpoint.CategorizedBreakpoint, Item>;
    focus(): void;
    private createCategory;
    protected createBreakpoint(breakpoint: SDK.CategorizedBreakpoint.CategorizedBreakpoint): void;
    protected getBreakpointFromPausedDetails(_details: SDK.DebuggerModel.DebuggerPausedDetails): SDK.CategorizedBreakpoint.CategorizedBreakpoint | null;
    private update;
    private categoryCheckboxClicked;
    protected toggleBreakpoint(breakpoint: SDK.CategorizedBreakpoint.CategorizedBreakpoint, enabled: boolean): void;
    private breakpointCheckboxClicked;
    wasShown(): void;
}
export interface Item {
    element: UI.TreeOutline.TreeElement;
    checkbox: HTMLInputElement;
}

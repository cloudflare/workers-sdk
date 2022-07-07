import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class IsolateSelector extends UI.Widget.VBox implements UI.ListControl.ListDelegate<ListItem>, SDK.IsolateManager.Observer {
    readonly items: UI.ListModel.ListModel<ListItem>;
    list: UI.ListControl.ListControl<ListItem>;
    readonly itemByIsolate: Map<SDK.IsolateManager.Isolate, ListItem>;
    readonly totalElement: HTMLDivElement;
    totalValueDiv: HTMLElement;
    readonly totalTrendDiv: HTMLElement;
    constructor();
    wasShown(): void;
    willHide(): void;
    isolateAdded(isolate: SDK.IsolateManager.Isolate): void;
    isolateChanged(isolate: SDK.IsolateManager.Isolate): void;
    isolateRemoved(isolate: SDK.IsolateManager.Isolate): void;
    targetChanged(event: Common.EventTarget.EventTargetEvent<SDK.Target.Target>): void;
    heapStatsChanged(event: Common.EventTarget.EventTargetEvent<SDK.IsolateManager.Isolate>): void;
    updateTotal(): void;
    static formatTrendElement(trendValueMs: number, element: Element): void;
    totalMemoryElement(): Element;
    createElementForItem(item: ListItem): Element;
    heightForItem(_item: ListItem): number;
    updateSelectedItemARIA(_fromElement: Element | null, _toElement: Element | null): boolean;
    isItemSelectable(_item: ListItem): boolean;
    selectedItemChanged(_from: ListItem | null, to: ListItem | null, fromElement: Element | null, toElement: Element | null): void;
    update(): void;
}
export declare class ListItem {
    isolate: SDK.IsolateManager.Isolate;
    element: HTMLDivElement;
    heapDiv: HTMLElement;
    readonly trendDiv: HTMLElement;
    readonly nameDiv: HTMLElement;
    constructor(isolate: SDK.IsolateManager.Isolate);
    model(): SDK.RuntimeModel.RuntimeModel | null;
    updateStats(): void;
    updateTitle(): void;
}

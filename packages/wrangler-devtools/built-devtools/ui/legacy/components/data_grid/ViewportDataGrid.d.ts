import * as Common from '../../../../core/common/common.js';
import * as Platform from '../../../../core/platform/platform.js';
import type { DataGridData, Parameters } from './DataGrid.js';
import { DataGridImpl, DataGridNode } from './DataGrid.js';
declare const ViewportDataGrid_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T_1 extends Events.ViewportCalculated>(eventType: T_1, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_1]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T_1>;
    once<T_1 extends Events.ViewportCalculated>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends Events.ViewportCalculated>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: Events.ViewportCalculated): boolean;
    dispatchEventToListeners<T_3 extends Events.ViewportCalculated>(eventType: Platform.TypeScriptUtilities.NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof DataGridImpl;
export declare class ViewportDataGrid<T> extends ViewportDataGrid_base<ViewportDataGridNode<T>> {
    private readonly onScrollBound;
    private visibleNodes;
    stickToBottom: boolean;
    private updateIsFromUser;
    private lastScrollTop;
    private firstVisibleIsStriped;
    private isStriped;
    private updateAnimationFrameId?;
    constructor(dataGridParameters: Parameters);
    setStriped(striped: boolean): void;
    private updateStripesClass;
    setScrollContainer(scrollContainer: HTMLElement): void;
    onResize(): void;
    setStickToBottom(stick: boolean): void;
    private onScroll;
    scheduleUpdateStructure(): void;
    scheduleUpdate(isFromUser?: boolean): void;
    updateInstantly(): void;
    renderInline(): void;
    private calculateVisibleNodes;
    private contentHeight;
    private update;
    revealViewportNode(node: ViewportDataGridNode<T>): void;
}
export declare enum Events {
    ViewportCalculated = "ViewportCalculated"
}
export declare type EventTypes = {
    [Events.ViewportCalculated]: void;
};
export declare class ViewportDataGridNode<T> extends DataGridNode<ViewportDataGridNode<T>> {
    private stale;
    private flatNodes;
    private isStripedInternal;
    constructor(data?: DataGridData | null, hasChildren?: boolean);
    element(): Element;
    setStriped(isStriped: boolean): void;
    isStriped(): boolean;
    clearFlatNodes(): void;
    flatChildren(): ViewportDataGridNode<T>[];
    insertChild(child: DataGridNode<ViewportDataGridNode<T>>, index: number): void;
    removeChild(child: DataGridNode<ViewportDataGridNode<T>>): void;
    removeChildren(): void;
    private unlink;
    collapse(): void;
    expand(): void;
    attached(): boolean;
    refresh(): void;
    reveal(): void;
    recalculateSiblings(index: number): void;
}
export {};

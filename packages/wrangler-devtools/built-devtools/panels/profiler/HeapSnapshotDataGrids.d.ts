import * as Common from '../../core/common/common.js';
import * as HeapSnapshotModel from '../../models/heap_snapshot_model/heap_snapshot_model.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as Components from '../../ui/legacy/components/utils/utils.js';
import type * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { HeapSnapshotGridNode } from './HeapSnapshotGridNodes.js';
import { HeapSnapshotRetainingObjectNode, HeapSnapshotObjectNode } from './HeapSnapshotGridNodes.js';
import type { HeapSnapshotProxy } from './HeapSnapshotProxy.js';
import type { HeapProfileHeader } from './HeapSnapshotView.js';
import type { DataDisplayDelegate } from './ProfileHeader.js';
declare class HeapSnapshotSortableDataGridBase extends DataGrid.DataGrid.DataGridImpl<HeapSnapshotGridNode> {
}
declare const HeapSnapshotSortableDataGrid_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends keyof EventTypes>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends keyof EventTypes>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends keyof EventTypes>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: keyof EventTypes): boolean;
    dispatchEventToListeners<T_3 extends keyof EventTypes>(eventType: import("../../core/platform/typescript-utilities.js").NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof HeapSnapshotSortableDataGridBase;
export declare class HeapSnapshotSortableDataGrid extends HeapSnapshotSortableDataGrid_base {
    snapshot: HeapSnapshotProxy | null;
    selectedNode: HeapSnapshotGridNode | null;
    readonly heapProfilerModelInternal: SDK.HeapProfilerModel.HeapProfilerModel | null;
    readonly dataDisplayDelegateInternal: DataDisplayDelegate;
    recursiveSortingDepth: number;
    populatedAndSorted: boolean;
    nameFilter: UI.Toolbar.ToolbarInput | null;
    nodeFilterInternal: HeapSnapshotModel.HeapSnapshotModel.NodeFilter | undefined;
    lastSortColumnId?: string | null;
    lastSortAscending?: boolean;
    constructor(heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel | null, dataDisplayDelegate: DataDisplayDelegate, dataGridParameters: DataGrid.DataGrid.Parameters);
    setDataSource(_snapshot: HeapSnapshotProxy, _nodeIndex: number): Promise<void>;
    isFilteredOut(node: HeapSnapshotGridNode): boolean;
    heapProfilerModel(): SDK.HeapProfilerModel.HeapProfilerModel | null;
    dataDisplayDelegate(): DataDisplayDelegate;
    nodeFilter(): HeapSnapshotModel.HeapSnapshotModel.NodeFilter | undefined;
    setNameFilter(nameFilter: UI.Toolbar.ToolbarInput): void;
    defaultPopulateCount(): number;
    disposeAllNodes(): void;
    wasShown(): void;
    sortingComplete(): void;
    willHide(): void;
    populateContextMenu(contextMenu: UI.ContextMenu.ContextMenu, gridNode: DataGrid.DataGrid.DataGridNode<HeapSnapshotGridNode>): void;
    resetSortingCache(): void;
    topLevelNodes(): HeapSnapshotGridNode[];
    revealObjectByHeapSnapshotId(_heapSnapshotObjectId: string): Promise<HeapSnapshotGridNode | null>;
    resetNameFilter(): void;
    onNameFilterChanged(): void;
    deselectFilteredNodes(): void;
    sortFields(_sortColumnId: string, _ascending: boolean): HeapSnapshotModel.HeapSnapshotModel.ComparatorConfig;
    sortingChanged(): void;
    performSorting(sortFunction: (arg0: DataGrid.DataGrid.DataGridNode<HeapSnapshotGridNode>, arg1: DataGrid.DataGrid.DataGridNode<HeapSnapshotGridNode>) => number): void;
    appendChildAfterSorting(child: HeapSnapshotGridNode): void;
    recursiveSortingEnter(): void;
    recursiveSortingLeave(): void;
    updateVisibleNodes(_force: boolean): void;
    allChildren(parent: DataGrid.DataGrid.DataGridNode<HeapSnapshotGridNode>): DataGrid.DataGrid.DataGridNode<HeapSnapshotGridNode>[];
    insertChild(parent: HeapSnapshotGridNode, node: HeapSnapshotGridNode, index: number): void;
    removeChildByIndex(parent: HeapSnapshotGridNode, index: number): void;
    removeAllChildren(parent: HeapSnapshotGridNode): void;
}
export declare enum HeapSnapshotSortableDataGridEvents {
    ContentShown = "ContentShown",
    SortingComplete = "SortingComplete",
    ExpandRetainersComplete = "ExpandRetainersComplete"
}
export declare type EventTypes = {
    [HeapSnapshotSortableDataGridEvents.ContentShown]: HeapSnapshotSortableDataGrid;
    [HeapSnapshotSortableDataGridEvents.SortingComplete]: void;
    [HeapSnapshotSortableDataGridEvents.ExpandRetainersComplete]: void;
};
export declare class HeapSnapshotViewportDataGrid extends HeapSnapshotSortableDataGrid {
    topPaddingHeight: number;
    bottomPaddingHeight: number;
    selectedNode: HeapSnapshotGridNode | null;
    scrollToResolveCallback?: (() => void) | null;
    constructor(heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel | null, dataDisplayDelegate: DataDisplayDelegate, dataGridParameters: DataGrid.DataGrid.Parameters);
    topLevelNodes(): HeapSnapshotGridNode[];
    appendChildAfterSorting(_child: HeapSnapshotGridNode): void;
    updateVisibleNodes(force: boolean): void;
    addVisibleNodes(parentNode: DataGrid.DataGrid.DataGridNode<HeapSnapshotGridNode>, topBound: number, bottomBound: number): number;
    nodeHeight(node: HeapSnapshotGridNode): number;
    revealTreeNode(pathToReveal: HeapSnapshotGridNode[]): Promise<HeapSnapshotGridNode>;
    calculateOffset(pathToReveal: HeapSnapshotGridNode[]): number;
    allChildren(parent: DataGrid.DataGrid.DataGridNode<HeapSnapshotGridNode>): HeapSnapshotGridNode[];
    appendNode(parent: DataGrid.DataGrid.DataGridNode<HeapSnapshotGridNode>, node: HeapSnapshotGridNode): void;
    insertChild(parent: HeapSnapshotGridNode, node: HeapSnapshotGridNode, index: number): void;
    removeChildByIndex(parent: HeapSnapshotGridNode, index: number): void;
    removeAllChildren(parent: HeapSnapshotGridNode): void;
    removeTopLevelNodes(): void;
    isScrolledIntoView(element: HTMLElement): boolean;
    onResize(): void;
    onScroll(_event: Event): void;
}
export declare class HeapSnapshotContainmentDataGrid extends HeapSnapshotSortableDataGrid {
    constructor(heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel | null, dataDisplayDelegate: DataDisplayDelegate, displayName: string, columns?: DataGrid.DataGrid.ColumnDescriptor[]);
    setDataSource(snapshot: HeapSnapshotProxy, nodeIndex: number): Promise<void>;
    createRootNode(snapshot: HeapSnapshotProxy, node: HeapSnapshotModel.HeapSnapshotModel.Node): HeapSnapshotObjectNode;
    sortingChanged(): void;
}
export declare class HeapSnapshotRetainmentDataGrid extends HeapSnapshotContainmentDataGrid {
    constructor(heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel | null, dataDisplayDelegate: DataDisplayDelegate);
    createRootNode(snapshot: HeapSnapshotProxy, node: HeapSnapshotModel.HeapSnapshotModel.Node): HeapSnapshotRetainingObjectNode;
    sortFields(sortColumn: string, sortAscending: boolean): HeapSnapshotModel.HeapSnapshotModel.ComparatorConfig;
    reset(): void;
    setDataSource(snapshot: HeapSnapshotProxy, nodeIndex: number): Promise<void>;
}
export declare enum HeapSnapshotRetainmentDataGridEvents {
    ExpandRetainersComplete = "ExpandRetainersComplete"
}
export declare class HeapSnapshotConstructorsDataGrid extends HeapSnapshotViewportDataGrid {
    profileIndex: number;
    objectIdToSelect: string | null;
    nextRequestedFilter: HeapSnapshotModel.HeapSnapshotModel.NodeFilter | null;
    lastFilter?: HeapSnapshotModel.HeapSnapshotModel.NodeFilter | null;
    filterInProgress?: HeapSnapshotModel.HeapSnapshotModel.NodeFilter | null;
    constructor(heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel | null, dataDisplayDelegate: DataDisplayDelegate);
    sortFields(sortColumn: string, sortAscending: boolean): HeapSnapshotModel.HeapSnapshotModel.ComparatorConfig;
    revealObjectByHeapSnapshotId(id: string): Promise<HeapSnapshotGridNode | null>;
    clear(): void;
    setDataSource(snapshot: HeapSnapshotProxy, _nodeIndex: number): Promise<void>;
    setSelectionRange(minNodeId: number, maxNodeId: number): void;
    setAllocationNodeId(allocationNodeId: number): void;
    aggregatesReceived(nodeFilter: HeapSnapshotModel.HeapSnapshotModel.NodeFilter, aggregates: {
        [x: string]: HeapSnapshotModel.HeapSnapshotModel.Aggregate;
    }): void;
    populateChildren(maybeNodeFilter?: HeapSnapshotModel.HeapSnapshotModel.NodeFilter): Promise<void>;
    filterSelectIndexChanged(profiles: HeapProfileHeader[], profileIndex: number): void;
}
export declare class HeapSnapshotDiffDataGrid extends HeapSnapshotViewportDataGrid {
    baseSnapshot?: HeapSnapshotProxy;
    constructor(heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel | null, dataDisplayDelegate: DataDisplayDelegate);
    defaultPopulateCount(): number;
    sortFields(sortColumn: string, sortAscending: boolean): HeapSnapshotModel.HeapSnapshotModel.ComparatorConfig;
    setDataSource(snapshot: HeapSnapshotProxy, _nodeIndex: number): Promise<void>;
    setBaseDataSource(baseSnapshot: HeapSnapshotProxy): void;
    populateChildren(): Promise<void>;
}
export declare class AllocationDataGrid extends HeapSnapshotViewportDataGrid {
    readonly linkifierInternal: Components.Linkifier.Linkifier;
    topNodes?: HeapSnapshotModel.HeapSnapshotModel.SerializedAllocationNode[];
    constructor(heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel | null, dataDisplayDelegate: DataDisplayDelegate);
    get linkifier(): Components.Linkifier.Linkifier;
    dispose(): void;
    setDataSource(snapshot: HeapSnapshotProxy, _nodeIndex: number): Promise<void>;
    populateChildren(): void;
    sortingChanged(): void;
    createComparator(): (arg0: Object, arg1: Object) => number;
}
export {};

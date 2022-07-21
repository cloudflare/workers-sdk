import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as HeapSnapshotModel from '../../models/heap_snapshot_model/heap_snapshot_model.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { ChildrenProvider } from './ChildrenProvider.js';
import type { AllocationDataGrid, HeapSnapshotConstructorsDataGrid, HeapSnapshotDiffDataGrid, HeapSnapshotSortableDataGrid } from './HeapSnapshotDataGrids.js';
import type { HeapSnapshotProviderProxy, HeapSnapshotProxy } from './HeapSnapshotProxy.js';
import type { DataDisplayDelegate } from './ProfileHeader.js';
declare class HeapSnapshotGridNodeBase extends DataGrid.DataGrid.DataGridNode<HeapSnapshotGridNode> {
}
declare const HeapSnapshotGridNode_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<HeapSnapshotGridNode.EventTypes>;
    addEventListener<T extends HeapSnapshotGridNode.Events.PopulateComplete>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<HeapSnapshotGridNode.EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<HeapSnapshotGridNode.EventTypes, T>;
    once<T_1 extends HeapSnapshotGridNode.Events.PopulateComplete>(eventType: T_1): Promise<HeapSnapshotGridNode.EventTypes[T_1]>;
    removeEventListener<T_2 extends HeapSnapshotGridNode.Events.PopulateComplete>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<HeapSnapshotGridNode.EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: HeapSnapshotGridNode.Events.PopulateComplete): boolean;
    dispatchEventToListeners<T_3 extends HeapSnapshotGridNode.Events.PopulateComplete>(eventType: Platform.TypeScriptUtilities.NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<HeapSnapshotGridNode.EventTypes, T_3>): void;
}) & typeof HeapSnapshotGridNodeBase;
export declare class HeapSnapshotGridNode extends HeapSnapshotGridNode_base {
    dataGridInternal: HeapSnapshotSortableDataGrid;
    instanceCount: number;
    readonly savedChildren: Map<number, HeapSnapshotGridNode>;
    retrievedChildrenRanges: {
        from: number;
        to: number;
    }[];
    providerObject: ChildrenProvider | null;
    reachableFromWindow: boolean;
    populated?: boolean;
    constructor(tree: HeapSnapshotSortableDataGrid, hasChildren: boolean);
    get name(): string | undefined;
    heapSnapshotDataGrid(): HeapSnapshotSortableDataGrid;
    createProvider(): ChildrenProvider;
    comparator(): HeapSnapshotModel.HeapSnapshotModel.ComparatorConfig;
    getHash(): number;
    createChildNode(_item: HeapSnapshotModel.HeapSnapshotModel.Node | HeapSnapshotModel.HeapSnapshotModel.Edge): HeapSnapshotGridNode;
    retainersDataSource(): {
        snapshot: HeapSnapshotProxy;
        snapshotNodeIndex: number;
    } | null;
    provider(): ChildrenProvider;
    createCell(columnId: string): HTMLElement;
    collapse(): void;
    expand(): void;
    dispose(): void;
    queryObjectContent(_heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel, _objectGroupName: string): Promise<SDK.RemoteObject.RemoteObject>;
    tryQueryObjectContent(_heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel, _objectGroupName: string): Promise<SDK.RemoteObject.RemoteObject | null>;
    populateContextMenu(_contextMenu: UI.ContextMenu.ContextMenu, _dataDisplayDelegate: DataDisplayDelegate, _heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel | null): void;
    toPercentString(num: number): string;
    toUIDistance(distance: number): string;
    allChildren(): HeapSnapshotGridNode[];
    removeChildByIndex(index: number): void;
    childForPosition(nodePosition: number): HeapSnapshotGridNode | null;
    createValueCell(columnId: string): HTMLElement;
    populate(): void;
    expandWithoutPopulate(): Promise<void>;
    childHashForEntity(entity: HeapSnapshotModel.HeapSnapshotModel.Node | HeapSnapshotModel.HeapSnapshotModel.Edge): number;
    populateChildren(fromPosition?: number | null, toPosition?: number | null): Promise<void>;
    saveChildren(): void;
    sort(): Promise<void>;
}
export declare namespace HeapSnapshotGridNode {
    enum Events {
        PopulateComplete = "PopulateComplete"
    }
    type EventTypes = {
        [Events.PopulateComplete]: void;
    };
}
export declare abstract class HeapSnapshotGenericObjectNode extends HeapSnapshotGridNode {
    referenceName?: string | null;
    readonly nameInternal: string | undefined;
    readonly type: string | undefined;
    readonly distance: number | undefined;
    shallowSize: number | undefined;
    readonly retainedSize: number | undefined;
    snapshotNodeId: number | undefined;
    snapshotNodeIndex: number | undefined;
    detachedDOMTreeNode: boolean | undefined;
    linkElement?: Element;
    constructor(dataGrid: HeapSnapshotSortableDataGrid, node: HeapSnapshotModel.HeapSnapshotModel.Node);
    get name(): string | undefined;
    retainersDataSource(): {
        snapshot: HeapSnapshotProxy;
        snapshotNodeIndex: number;
    } | null;
    createCell(columnId: string): HTMLElement;
    createObjectCell(): HTMLElement;
    createObjectCellWithValue(valueStyle: string, value: string): HTMLElement;
    prefixObjectCell(_div: Element): void;
    appendSourceLocation(div: Element): Promise<void>;
    queryObjectContent(heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel, objectGroupName: string): Promise<SDK.RemoteObject.RemoteObject>;
    tryQueryObjectContent(heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel, objectGroupName: string): Promise<SDK.RemoteObject.RemoteObject | null>;
    updateHasChildren(): Promise<void>;
    shortenWindowURL(fullName: string, hasObjectId: boolean): string;
    populateContextMenu(contextMenu: UI.ContextMenu.ContextMenu, dataDisplayDelegate: DataDisplayDelegate, heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel | null): void;
}
export declare class HeapSnapshotObjectNode extends HeapSnapshotGenericObjectNode {
    referenceName: string;
    readonly referenceType: string;
    readonly edgeIndex: number;
    readonly snapshot: HeapSnapshotProxy;
    parentObjectNode: HeapSnapshotObjectNode | null;
    readonly cycledWithAncestorGridNode: HeapSnapshotObjectNode | null;
    constructor(dataGrid: HeapSnapshotSortableDataGrid, snapshot: HeapSnapshotProxy, edge: HeapSnapshotModel.HeapSnapshotModel.Edge, parentObjectNode: HeapSnapshotObjectNode | null);
    retainersDataSource(): {
        snapshot: HeapSnapshotProxy;
        snapshotNodeIndex: number;
    } | null;
    createProvider(): HeapSnapshotProviderProxy;
    findAncestorWithSameSnapshotNodeId(): HeapSnapshotObjectNode | null;
    createChildNode(item: HeapSnapshotModel.HeapSnapshotModel.Node | HeapSnapshotModel.HeapSnapshotModel.Edge): HeapSnapshotObjectNode;
    getHash(): number;
    comparator(): HeapSnapshotModel.HeapSnapshotModel.ComparatorConfig;
    prefixObjectCell(div: Element): void;
    edgeNodeSeparator(): string;
}
export declare class HeapSnapshotRetainingObjectNode extends HeapSnapshotObjectNode {
    constructor(dataGrid: HeapSnapshotSortableDataGrid, snapshot: HeapSnapshotProxy, edge: HeapSnapshotModel.HeapSnapshotModel.Edge, parentRetainingObjectNode: HeapSnapshotRetainingObjectNode | null);
    createProvider(): HeapSnapshotProviderProxy;
    createChildNode(item: HeapSnapshotModel.HeapSnapshotModel.Node | HeapSnapshotModel.HeapSnapshotModel.Edge): HeapSnapshotRetainingObjectNode;
    edgeNodeSeparator(): string;
    expand(): void;
    expandRetainersChain(maxExpandLevels: number): void;
}
export declare class HeapSnapshotInstanceNode extends HeapSnapshotGenericObjectNode {
    readonly baseSnapshotOrSnapshot: HeapSnapshotProxy;
    readonly isDeletedNode: boolean;
    constructor(dataGrid: HeapSnapshotSortableDataGrid, snapshot: HeapSnapshotProxy, node: HeapSnapshotModel.HeapSnapshotModel.Node, isDeletedNode: boolean);
    retainersDataSource(): {
        snapshot: HeapSnapshotProxy;
        snapshotNodeIndex: number;
    } | null;
    createProvider(): HeapSnapshotProviderProxy;
    createChildNode(item: HeapSnapshotModel.HeapSnapshotModel.Node | HeapSnapshotModel.HeapSnapshotModel.Edge): HeapSnapshotObjectNode;
    getHash(): number;
    comparator(): HeapSnapshotModel.HeapSnapshotModel.ComparatorConfig;
}
export declare class HeapSnapshotConstructorNode extends HeapSnapshotGridNode {
    readonly nameInternal: string;
    readonly nodeFilter: HeapSnapshotModel.HeapSnapshotModel.NodeFilter;
    readonly distance: number;
    readonly count: number;
    readonly shallowSize: number;
    readonly retainedSize: number;
    constructor(dataGrid: HeapSnapshotConstructorsDataGrid, className: string, aggregate: HeapSnapshotModel.HeapSnapshotModel.Aggregate, nodeFilter: HeapSnapshotModel.HeapSnapshotModel.NodeFilter);
    get name(): string | undefined;
    createProvider(): HeapSnapshotProviderProxy;
    populateNodeBySnapshotObjectId(snapshotObjectId: number): Promise<HeapSnapshotGridNode[]>;
    filteredOut(filterValue: string): boolean;
    createCell(columnId: string): HTMLElement;
    createChildNode(item: HeapSnapshotModel.HeapSnapshotModel.Node | HeapSnapshotModel.HeapSnapshotModel.Edge): HeapSnapshotInstanceNode;
    comparator(): HeapSnapshotModel.HeapSnapshotModel.ComparatorConfig;
}
export declare class HeapSnapshotDiffNodesProvider implements ChildrenProvider {
    addedNodesProvider: HeapSnapshotProviderProxy;
    deletedNodesProvider: HeapSnapshotProviderProxy;
    addedCount: number;
    removedCount: number;
    constructor(addedNodesProvider: HeapSnapshotProviderProxy, deletedNodesProvider: HeapSnapshotProviderProxy, addedCount: number, removedCount: number);
    dispose(): void;
    nodePosition(_snapshotObjectId: number): Promise<number>;
    isEmpty(): Promise<boolean>;
    serializeItemsRange(beginPosition: number, endPosition: number): Promise<HeapSnapshotModel.HeapSnapshotModel.ItemsRange>;
    sortAndRewind(comparator: HeapSnapshotModel.HeapSnapshotModel.ComparatorConfig): Promise<void>;
}
export declare class HeapSnapshotDiffNode extends HeapSnapshotGridNode {
    readonly nameInternal: string;
    readonly addedCount: number;
    readonly removedCount: number;
    readonly countDelta: number;
    readonly addedSize: number;
    readonly removedSize: number;
    readonly sizeDelta: number;
    readonly deletedIndexes: number[];
    constructor(dataGrid: HeapSnapshotDiffDataGrid, className: string, diffForClass: HeapSnapshotModel.HeapSnapshotModel.DiffForClass);
    get name(): string | undefined;
    createProvider(): HeapSnapshotDiffNodesProvider;
    createCell(columnId: string): HTMLElement;
    createChildNode(item: HeapSnapshotModel.HeapSnapshotModel.Node | HeapSnapshotModel.HeapSnapshotModel.Edge): HeapSnapshotInstanceNode;
    comparator(): HeapSnapshotModel.HeapSnapshotModel.ComparatorConfig;
    filteredOut(filterValue: string): boolean;
    signForDelta(delta: number): '' | '+' | '−';
}
export declare class AllocationGridNode extends HeapSnapshotGridNode {
    populated: boolean;
    readonly allocationNode: HeapSnapshotModel.HeapSnapshotModel.SerializedAllocationNode;
    constructor(dataGrid: AllocationDataGrid, data: HeapSnapshotModel.HeapSnapshotModel.SerializedAllocationNode);
    populate(): void;
    doPopulate(): Promise<void>;
    expand(): void;
    createCell(columnId: string): HTMLElement;
    allocationNodeId(): number;
}
export {};

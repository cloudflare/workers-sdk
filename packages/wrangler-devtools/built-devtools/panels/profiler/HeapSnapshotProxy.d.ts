import * as Common from '../../core/common/common.js';
import type * as HeapSnapshotModel from '../../models/heap_snapshot_model/heap_snapshot_model.js';
import type { ChildrenProvider } from './ChildrenProvider.js';
export declare class HeapSnapshotWorkerProxy extends Common.ObjectWrapper.ObjectWrapper<HeapSnapshotWorkerProxy.EventTypes> {
    readonly eventHandler: (arg0: string, arg1: any) => void;
    nextObjectId: number;
    nextCallId: number;
    callbacks: Map<number, (arg0: any) => void>;
    readonly previousCallbacks: Set<number>;
    readonly worker: Common.Worker.WorkerWrapper;
    interval?: number;
    constructor(eventHandler: (arg0: string, arg1: any) => void);
    createLoader(profileUid: number, snapshotReceivedCallback: (arg0: HeapSnapshotProxy) => void): HeapSnapshotLoaderProxy;
    dispose(): void;
    disposeObject(objectId: number): void;
    evaluateForTest(script: string, callback: (arg0: any) => void): void;
    callFactoryMethod<T>(callback: ((...arg0: unknown[]) => void) | null, objectId: string, methodName: string, proxyConstructor: new (...arg1: unknown[]) => T): Object | null;
    callMethod(callback: (arg0: any) => void, objectId: string, methodName: string): void;
    startCheckingForLongRunningCalls(): void;
    checkLongRunningCalls(): void;
    messageReceived(event: MessageEvent<any>): void;
    postMessage(message: any): void;
}
export declare namespace HeapSnapshotWorkerProxy {
    const enum Events {
        Wait = "Wait"
    }
    type EventTypes = {
        [Events.Wait]: boolean;
    };
}
export declare class HeapSnapshotProxyObject {
    readonly worker: HeapSnapshotWorkerProxy;
    readonly objectId: number;
    constructor(worker: HeapSnapshotWorkerProxy, objectId: number);
    callWorker(workerMethodName: string, args: any[]): any;
    dispose(): void;
    disposeWorker(): void;
    callFactoryMethod<T>(_callback: ((...arg0: any[]) => void) | null, _methodName: string, _proxyConstructor: new (...arg1: any[]) => T, ..._var_args: any[]): T;
    callMethodPromise<T>(_methodName: string, ..._var_args: any[]): Promise<T>;
}
export declare class HeapSnapshotLoaderProxy extends HeapSnapshotProxyObject implements Common.StringOutputStream.OutputStream {
    readonly profileUid: number;
    readonly snapshotReceivedCallback: (arg0: HeapSnapshotProxy) => void;
    constructor(worker: HeapSnapshotWorkerProxy, objectId: number, profileUid: number, snapshotReceivedCallback: (arg0: HeapSnapshotProxy) => void);
    write(chunk: string): Promise<void>;
    close(): Promise<void>;
}
export declare class HeapSnapshotProxy extends HeapSnapshotProxyObject {
    staticData: HeapSnapshotModel.HeapSnapshotModel.StaticData | null;
    profileUid?: string;
    constructor(worker: HeapSnapshotWorkerProxy, objectId: number);
    search(searchConfig: HeapSnapshotModel.HeapSnapshotModel.SearchConfig, filter: HeapSnapshotModel.HeapSnapshotModel.NodeFilter): Promise<number[]>;
    aggregatesWithFilter(filter: HeapSnapshotModel.HeapSnapshotModel.NodeFilter): Promise<{
        [x: string]: HeapSnapshotModel.HeapSnapshotModel.Aggregate;
    }>;
    aggregatesForDiff(): Promise<{
        [x: string]: HeapSnapshotModel.HeapSnapshotModel.AggregateForDiff;
    }>;
    calculateSnapshotDiff(baseSnapshotId: string, baseSnapshotAggregates: {
        [x: string]: HeapSnapshotModel.HeapSnapshotModel.AggregateForDiff;
    }): Promise<{
        [x: string]: HeapSnapshotModel.HeapSnapshotModel.Diff;
    }>;
    nodeClassName(snapshotObjectId: number): Promise<string | null>;
    createEdgesProvider(nodeIndex: number): HeapSnapshotProviderProxy;
    createRetainingEdgesProvider(nodeIndex: number): HeapSnapshotProviderProxy;
    createAddedNodesProvider(baseSnapshotId: string, className: string): HeapSnapshotProviderProxy | null;
    createDeletedNodesProvider(nodeIndexes: number[]): HeapSnapshotProviderProxy | null;
    createNodesProvider(filter: (arg0: any) => boolean): HeapSnapshotProviderProxy | null;
    createNodesProviderForClass(className: string, nodeFilter: HeapSnapshotModel.HeapSnapshotModel.NodeFilter): HeapSnapshotProviderProxy | null;
    allocationTracesTops(): Promise<HeapSnapshotModel.HeapSnapshotModel.SerializedAllocationNode[]>;
    allocationNodeCallers(nodeId: number): Promise<HeapSnapshotModel.HeapSnapshotModel.AllocationNodeCallers>;
    allocationStack(nodeIndex: number): Promise<HeapSnapshotModel.HeapSnapshotModel.AllocationStackFrame[] | null>;
    dispose(): void;
    get nodeCount(): number;
    get rootNodeIndex(): number;
    updateStaticData(): Promise<void>;
    getStatistics(): Promise<HeapSnapshotModel.HeapSnapshotModel.Statistics>;
    getLocation(nodeIndex: number): Promise<HeapSnapshotModel.HeapSnapshotModel.Location | null>;
    getSamples(): Promise<HeapSnapshotModel.HeapSnapshotModel.Samples | null>;
    get totalSize(): number;
    get uid(): string | undefined;
    setProfileUid(profileUid: string): void;
    maxJSObjectId(): number;
}
export declare class HeapSnapshotProviderProxy extends HeapSnapshotProxyObject implements ChildrenProvider {
    constructor(worker: HeapSnapshotWorkerProxy, objectId: number);
    nodePosition(snapshotObjectId: number): Promise<number>;
    isEmpty(): Promise<boolean>;
    serializeItemsRange(startPosition: number, endPosition: number): Promise<HeapSnapshotModel.HeapSnapshotModel.ItemsRange>;
    sortAndRewind(comparator: HeapSnapshotModel.HeapSnapshotModel.ComparatorConfig): Promise<void>;
}

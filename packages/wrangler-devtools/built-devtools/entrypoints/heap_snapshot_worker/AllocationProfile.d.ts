import * as HeapSnapshotModel from '../../models/heap_snapshot_model/heap_snapshot_model.js';
export declare class AllocationProfile {
    #private;
    constructor(profile: any, liveObjectStats: any);
    serializeTraceTops(): HeapSnapshotModel.HeapSnapshotModel.SerializedAllocationNode[];
    serializeCallers(nodeId: number): HeapSnapshotModel.HeapSnapshotModel.AllocationNodeCallers;
    serializeAllocationStack(traceNodeId: number): HeapSnapshotModel.HeapSnapshotModel.AllocationStackFrame[];
    traceIds(allocationNodeId: number): number[];
}
export declare class TopDownAllocationNode {
    id: number;
    functionInfo: FunctionAllocationInfo;
    allocationCount: number;
    allocationSize: number;
    liveCount: number;
    liveSize: number;
    parent: TopDownAllocationNode | null;
    children: TopDownAllocationNode[];
    constructor(id: number, functionInfo: FunctionAllocationInfo, count: number, size: number, liveCount: number, liveSize: number, parent: TopDownAllocationNode | null);
}
export declare class BottomUpAllocationNode {
    #private;
    functionInfo: FunctionAllocationInfo;
    allocationCount: number;
    allocationSize: number;
    liveCount: number;
    liveSize: number;
    traceTopIds: number[];
    constructor(functionInfo: FunctionAllocationInfo);
    addCaller(traceNode: TopDownAllocationNode): BottomUpAllocationNode;
    callers(): BottomUpAllocationNode[];
    hasCallers(): boolean;
}
export declare class FunctionAllocationInfo {
    #private;
    functionName: string;
    scriptName: string;
    scriptId: number;
    line: number;
    column: number;
    totalCount: number;
    totalSize: number;
    totalLiveCount: number;
    totalLiveSize: number;
    constructor(functionName: string, scriptName: string, scriptId: number, line: number, column: number);
    addTraceTopNode(node: TopDownAllocationNode): void;
    bottomUpRoot(): BottomUpAllocationNode | null;
}

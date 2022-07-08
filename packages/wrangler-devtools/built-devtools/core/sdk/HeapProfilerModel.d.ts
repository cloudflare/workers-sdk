import type * as Protocol from '../../generated/protocol.js';
import type * as Platform from '../platform/platform.js';
import type { DebuggerModel } from './DebuggerModel.js';
import type { RemoteObject } from './RemoteObject.js';
import { RuntimeModel } from './RuntimeModel.js';
import type { Target } from './Target.js';
import { SDKModel } from './SDKModel.js';
export declare class HeapProfilerModel extends SDKModel<EventTypes> {
    #private;
    constructor(target: Target);
    debuggerModel(): DebuggerModel;
    runtimeModel(): RuntimeModel;
    enable(): Promise<void>;
    startSampling(samplingRateInBytes?: number): Promise<boolean>;
    stopSampling(): Promise<Protocol.HeapProfiler.SamplingHeapProfile | null>;
    getSamplingProfile(): Promise<Protocol.HeapProfiler.SamplingHeapProfile | null>;
    collectGarbage(): Promise<boolean>;
    snapshotObjectIdForObjectId(objectId: Protocol.Runtime.RemoteObjectId): Promise<string | null>;
    objectForSnapshotObjectId(snapshotObjectId: Protocol.HeapProfiler.HeapSnapshotObjectId, objectGroupName: string): Promise<RemoteObject | null>;
    addInspectedHeapObject(snapshotObjectId: Protocol.HeapProfiler.HeapSnapshotObjectId): Promise<boolean>;
    takeHeapSnapshot(heapSnapshotOptions: Protocol.HeapProfiler.TakeHeapSnapshotRequest): Promise<void>;
    startTrackingHeapObjects(recordAllocationStacks: boolean): Promise<boolean>;
    stopTrackingHeapObjects(reportProgress: boolean): Promise<boolean>;
    heapStatsUpdate(samples: number[]): void;
    lastSeenObjectId(lastSeenObjectId: number, timestamp: number): void;
    addHeapSnapshotChunk(chunk: string): void;
    reportHeapSnapshotProgress(done: number, total: number, finished?: boolean): void;
    resetProfiles(): void;
}
export declare enum Events {
    HeapStatsUpdate = "HeapStatsUpdate",
    LastSeenObjectId = "LastSeenObjectId",
    AddHeapSnapshotChunk = "AddHeapSnapshotChunk",
    ReportHeapSnapshotProgress = "ReportHeapSnapshotProgress",
    ResetProfiles = "ResetProfiles"
}
/**
 * An array of triplets. Each triplet describes a fragment. The first number is the fragment
 * index, the second number is a total count of objects for the fragment, the third number is
 * a total size of the objects for the fragment.
 */
export declare type HeapStatsUpdateSamples = number[];
export interface LastSeenObjectId {
    lastSeenObjectId: number;
    timestamp: number;
}
export interface HeapSnapshotProgress {
    done: number;
    total: number;
    finished?: boolean;
}
export declare type EventTypes = {
    [Events.HeapStatsUpdate]: HeapStatsUpdateSamples;
    [Events.LastSeenObjectId]: LastSeenObjectId;
    [Events.AddHeapSnapshotChunk]: string;
    [Events.ReportHeapSnapshotProgress]: HeapSnapshotProgress;
    [Events.ResetProfiles]: HeapProfilerModel;
};
export interface NativeProfilerCallFrame {
    functionName: string;
    url: Platform.DevToolsPath.UrlString;
    scriptId?: string;
    lineNumber?: number;
    columnNumber?: number;
}
export interface CommonHeapProfileNode {
    callFrame: NativeProfilerCallFrame;
    selfSize: number;
    id?: number;
    children: CommonHeapProfileNode[];
}
export interface CommonHeapProfile {
    head: CommonHeapProfileNode;
    modules: Protocol.Memory.Module[];
}

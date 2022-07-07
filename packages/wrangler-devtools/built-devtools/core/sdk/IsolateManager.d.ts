import * as Common from '../common/common.js';
import type { HeapProfilerModel } from './HeapProfilerModel.js';
import { RuntimeModel } from './RuntimeModel.js';
import type { SDKModelObserver } from './TargetManager.js';
export declare class IsolateManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements SDKModelObserver<RuntimeModel> {
    #private;
    constructor();
    static instance({ forceNew }?: {
        forceNew: boolean;
    }): IsolateManager;
    observeIsolates(observer: Observer): void;
    unobserveIsolates(observer: Observer): void;
    modelAdded(model: RuntimeModel): void;
    private modelAddedInternal;
    modelRemoved(model: RuntimeModel): void;
    isolateByModel(model: RuntimeModel): Isolate | null;
    isolates(): Iterable<Isolate>;
    private poll;
}
export interface Observer {
    isolateAdded(isolate: Isolate): void;
    isolateRemoved(isolate: Isolate): void;
    isolateChanged(isolate: Isolate): void;
}
export declare enum Events {
    MemoryChanged = "MemoryChanged"
}
export declare type EventTypes = {
    [Events.MemoryChanged]: Isolate;
};
export declare const MemoryTrendWindowMs = 120000;
export declare class Isolate {
    #private;
    readonly modelsInternal: Set<RuntimeModel>;
    constructor(id: string);
    id(): string;
    models(): Set<RuntimeModel>;
    runtimeModel(): RuntimeModel | null;
    heapProfilerModel(): HeapProfilerModel | null;
    update(): Promise<void>;
    samplesCount(): number;
    usedHeapSize(): number;
    /**
     * bytes per millisecond
     */
    usedHeapSizeGrowRate(): number;
    isMainThread(): boolean;
}
export declare class MemoryTrend {
    #private;
    constructor(maxCount: number);
    reset(): void;
    count(): number;
    add(heapSize: number, timestamp?: number): void;
    fitSlope(): number;
}

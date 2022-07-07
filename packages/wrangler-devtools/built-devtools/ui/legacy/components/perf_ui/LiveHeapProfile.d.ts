import * as Common from '../../../../core/common/common.js';
import * as SDK from '../../../../core/sdk/sdk.js';
export declare class LiveHeapProfile implements Common.Runnable.Runnable, SDK.TargetManager.SDKModelObserver<SDK.HeapProfilerModel.HeapProfilerModel> {
    private running;
    private sessionId;
    private loadEventCallback;
    private readonly setting;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): LiveHeapProfile;
    run(): Promise<void>;
    modelAdded(model: SDK.HeapProfilerModel.HeapProfilerModel): void;
    modelRemoved(_model: SDK.HeapProfilerModel.HeapProfilerModel): void;
    private startProfiling;
    private stopProfiling;
    private loadEventFired;
}

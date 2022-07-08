import * as SDK from '../../../../core/sdk/sdk.js';
import type * as Platform from '../../../../core/platform/platform.js';
import type * as Protocol from '../../../../generated/protocol.js';
export declare class Performance {
    private readonly helper;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): Performance;
    reset(): void;
    private appendLegacyCPUProfile;
    appendCPUProfile(profile: SDK.CPUProfileDataModel.CPUProfileDataModel): void;
}
export declare class Memory {
    private readonly helper;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): Memory;
    reset(): void;
    appendHeapProfile(profile: Protocol.HeapProfiler.SamplingHeapProfile, target: SDK.Target.Target | null): void;
}
export declare class Helper {
    private readonly type;
    private readonly locationPool;
    private updateTimer;
    private lineData;
    constructor(type: string);
    reset(): void;
    addLineData(target: SDK.Target.Target | null, scriptIdOrUrl: Platform.DevToolsPath.UrlString | number, line: number, data: number): void;
    scheduleUpdate(): void;
    private doUpdate;
}

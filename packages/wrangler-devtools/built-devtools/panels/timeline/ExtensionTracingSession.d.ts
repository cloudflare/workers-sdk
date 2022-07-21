import type * as Platform from '../../core/platform/platform.js';
import type * as SDK from '../../core/sdk/sdk.js';
import type * as Extensions from '../../models/extensions/extensions.js';
import type { PerformanceModel } from './PerformanceModel.js';
import type { Client } from './TimelineLoader.js';
export declare class ExtensionTracingSession implements Extensions.ExtensionTraceProvider.TracingSession, Client {
    private readonly provider;
    private readonly performanceModel;
    private completionCallback;
    private readonly completionPromise;
    private timeOffset;
    constructor(provider: Extensions.ExtensionTraceProvider.ExtensionTraceProvider, performanceModel: PerformanceModel);
    loadingStarted(): void;
    processingStarted(): void;
    loadingProgress(_progress?: number): void;
    loadingComplete(tracingModel: SDK.TracingModel.TracingModel | null): void;
    complete(url: Platform.DevToolsPath.UrlString, timeOffsetMicroseconds: number): void;
    start(): void;
    stop(): Promise<void>;
}

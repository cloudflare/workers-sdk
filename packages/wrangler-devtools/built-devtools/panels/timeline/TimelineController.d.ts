import * as SDK from '../../core/sdk/sdk.js';
import * as Extensions from '../../models/extensions/extensions.js';
import type * as Protocol from '../../generated/protocol.js';
import { PerformanceModel } from './PerformanceModel.js';
export declare class TimelineController implements SDK.TargetManager.SDKModelObserver<SDK.CPUProfilerModel.CPUProfilerModel>, SDK.TracingManager.TracingManagerClient {
    private readonly target;
    private tracingManager;
    private performanceModel;
    private readonly client;
    private readonly tracingModel;
    private extensionSessions;
    private extensionTraceProviders?;
    private tracingCompleteCallback?;
    private profiling?;
    private cpuProfiles?;
    constructor(target: SDK.Target.Target, client: Client);
    dispose(): void;
    mainTarget(): SDK.Target.Target;
    startRecording(options: RecordingOptions, providers: Extensions.ExtensionTraceProvider.ExtensionTraceProvider[]): Promise<Protocol.ProtocolResponseWithError>;
    stopRecording(): Promise<PerformanceModel>;
    private waitForTracingToStop;
    modelAdded(cpuProfilerModel: SDK.CPUProfilerModel.CPUProfilerModel): void;
    modelRemoved(_cpuProfilerModel: SDK.CPUProfilerModel.CPUProfilerModel): void;
    private startProfilingOnAllModels;
    private addCpuProfile;
    private stopProfilingOnAllModels;
    private startRecordingWithCategories;
    traceEventsCollected(events: SDK.TracingManager.EventPayload[]): void;
    tracingComplete(): void;
    private allSourcesFinished;
    private finalizeTrace;
    private injectCpuProfileEvent;
    private buildTargetToProcessIdMap;
    private injectCpuProfileEvents;
    tracingBufferUsage(usage: number): void;
    eventsRetrievalProgress(progress: number): void;
}
export interface Client {
    recordingProgress(usage: number): void;
    loadingStarted(): void;
    processingStarted(): void;
    loadingProgress(progress?: number): void;
    loadingComplete(tracingModel: SDK.TracingModel.TracingModel | null): void;
}
export interface RecordingOptions {
    enableJSSampling?: boolean;
    capturePictures?: boolean;
    captureFilmStrip?: boolean;
    startCoverage?: boolean;
}

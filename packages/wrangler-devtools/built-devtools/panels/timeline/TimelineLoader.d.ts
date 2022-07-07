import * as Common from '../../core/common/common.js';
import type * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
export declare class TimelineLoader implements Common.StringOutputStream.OutputStream {
    private client;
    private readonly backingStorage;
    private tracingModel;
    private canceledCallback;
    private state;
    private buffer;
    private firstRawChunk;
    private firstChunk;
    private loadedBytes;
    private totalSize;
    private readonly jsonTokenizer;
    constructor(client: Client);
    static loadFromFile(file: File, client: Client): TimelineLoader;
    static loadFromEvents(events: SDK.TracingManager.EventPayload[], client: Client): TimelineLoader;
    static loadFromURL(url: Platform.DevToolsPath.UrlString, client: Client): TimelineLoader;
    cancel(): void;
    write(chunk: string): Promise<void>;
    private writeBalancedJSON;
    private reportErrorAndCancelLoading;
    private looksLikeAppVersion;
    close(): Promise<void>;
    private finalizeTrace;
    private parseCPUProfileFormat;
}
export declare const TransferChunkLengthBytes = 5000000;
export interface Client {
    loadingStarted(): void;
    loadingProgress(progress?: number): void;
    processingStarted(): void;
    loadingComplete(tracingModel: SDK.TracingModel.TracingModel | null): void;
}
export declare enum State {
    Initial = "Initial",
    LookingForEvents = "LookingForEvents",
    ReadingEvents = "ReadingEvents",
    SkippingTail = "SkippingTail",
    LoadingCPUProfileFormat = "LoadingCPUProfileFormat"
}

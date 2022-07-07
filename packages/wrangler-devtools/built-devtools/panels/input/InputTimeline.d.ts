import * as SDK from '../../core/sdk/sdk.js';
import type * as Protocol from '../../generated/protocol.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as Timeline from '../timeline/timeline.js';
export declare class InputTimeline extends UI.Widget.VBox implements Timeline.TimelineLoader.Client {
    private tracingClient;
    private tracingModel;
    private inputModel;
    private state;
    private readonly toggleRecordAction;
    private readonly startReplayAction;
    private readonly togglePauseAction;
    private readonly panelToolbar;
    private readonly clearButton;
    private readonly loadButton;
    private readonly saveButton;
    private fileSelectorElement?;
    private loader?;
    constructor();
    static instance(opts?: {
        forceNew: boolean;
    }): InputTimeline;
    private reset;
    private createFileSelector;
    wasShown(): void;
    willHide(): void;
    private setState;
    private isAvailableState;
    private updateControls;
    toggleRecording(): void;
    startReplay(): void;
    toggleReplayPause(): void;
    /**
     * Saves all current events in a file (JSON format).
     */
    private saveToFile;
    private selectFileToLoad;
    private loadFromFile;
    private startRecording;
    private stopRecording;
    private replayEvents;
    private pauseReplay;
    private resumeReplay;
    loadingStarted(): void;
    loadingProgress(_progress?: number): void;
    processingStarted(): void;
    loadingComplete(tracingModel: SDK.TracingModel.TracingModel | null): void;
    private recordingFailed;
    replayStopped(): void;
}
export declare const enum State {
    Idle = "Idle",
    StartPending = "StartPending",
    Recording = "Recording",
    StopPending = "StopPending",
    Replaying = "Replaying",
    ReplayPaused = "ReplayPaused",
    Loading = "Loading"
}
export declare class ActionDelegate implements UI.ActionRegistration.ActionDelegate {
    static instance(opts?: {
        forceNew: boolean | null;
    }): ActionDelegate;
    handleAction(context: UI.Context.Context, actionId: string): boolean;
    private innerHandleAction;
}
export declare class TracingClient implements SDK.TracingManager.TracingManagerClient {
    private readonly target;
    private tracingManager;
    private readonly client;
    private readonly tracingModel;
    private tracingCompleteCallback;
    constructor(target: SDK.Target.Target, client: InputTimeline);
    startRecording(): Promise<Protocol.ProtocolResponseWithError | undefined>;
    stopRecording(): Promise<void>;
    traceEventsCollected(events: SDK.TracingManager.EventPayload[]): void;
    tracingComplete(): void;
    tracingBufferUsage(_usage: number): void;
    eventsRetrievalProgress(_progress: number): void;
    private waitForTracingToStop;
}

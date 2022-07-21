import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as TimelineModel from '../../models/timeline_model/timeline_model.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { Client } from './TimelineController.js';
export declare class TimelinePanel extends UI.Panel.Panel implements Client, TimelineModeViewDelegate {
    private readonly dropTarget;
    private readonly recordingOptionUIControls;
    private state;
    private recordingPageReload;
    private readonly millisecondsToRecordAfterLoadEvent;
    private readonly toggleRecordAction;
    private readonly recordReloadAction;
    private readonly historyManager;
    private performanceModel;
    private readonly viewModeSetting;
    private disableCaptureJSProfileSetting;
    private readonly captureLayersAndPicturesSetting;
    private showScreenshotsSetting;
    private startCoverage;
    private showMemorySetting;
    private showWebVitalsSetting;
    private readonly panelToolbar;
    private readonly panelRightToolbar;
    private readonly timelinePane;
    private readonly overviewPane;
    private overviewControls;
    private readonly statusPaneContainer;
    private readonly flameChart;
    private readonly searchableViewInternal;
    private showSettingsPaneButton;
    private showSettingsPaneSetting;
    private settingsPane;
    private controller;
    private clearButton;
    private loadButton;
    private saveButton;
    private statusPane;
    private landingPage;
    private loader?;
    private showScreenshotsToolbarCheckbox?;
    private showMemoryToolbarCheckbox?;
    private showWebVitalsToolbarCheckbox?;
    private startCoverageCheckbox?;
    private networkThrottlingSelect?;
    private cpuThrottlingSelect?;
    private fileSelectorElement?;
    private selection?;
    constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    } | undefined): TimelinePanel;
    searchableView(): UI.SearchableView.SearchableView | null;
    wasShown(): void;
    willHide(): void;
    loadFromEvents(events: SDK.TracingManager.EventPayload[]): void;
    private onOverviewWindowChanged;
    private onModelWindowChanged;
    private setState;
    private createSettingCheckbox;
    private populateToolbar;
    private createSettingsPane;
    private appendExtensionsToToolbar;
    private static settingForTraceProvider;
    private createNetworkConditionsSelect;
    private prepareToLoadTimeline;
    private createFileSelector;
    private contextMenu;
    saveToFile(): Promise<void>;
    showHistory(): Promise<void>;
    navigateHistory(direction: number): boolean;
    selectFileToLoad(): void;
    private loadFromFile;
    loadFromURL(url: Platform.DevToolsPath.UrlString): void;
    private updateOverviewControls;
    private onModeChanged;
    private onWebVitalsChanged;
    private updateSettingsPaneVisibility;
    private updateShowSettingsToolbarButton;
    private setUIControlsEnabled;
    private getCoverageViewWidget;
    private startRecording;
    private stopRecording;
    private recordingFailed;
    private onSuspendStateChanged;
    private updateTimelineControls;
    toggleRecording(): void;
    recordReload(): void;
    private onClearButton;
    private clear;
    private reset;
    private applyFilters;
    private setModel;
    private recordingStarted;
    recordingProgress(usage: number): void;
    private showLandingPage;
    private hideLandingPage;
    loadingStarted(): void;
    loadingProgress(progress?: number): void;
    processingStarted(): void;
    loadingComplete(tracingModel: SDK.TracingModel.TracingModel | null): void;
    private showRecordingStarted;
    private cancelLoading;
    private setMarkers;
    private loadEventFired;
    private frameForSelection;
    jumpToFrame(offset: number): true | undefined;
    select(selection: TimelineSelection | null): void;
    selectEntryAtTime(events: SDK.TracingModel.Event[] | null, time: number): void;
    highlightEvent(event: SDK.TracingModel.Event | null): void;
    private revealTimeRange;
    private handleDrop;
}
export declare enum State {
    Idle = "Idle",
    StartPending = "StartPending",
    Recording = "Recording",
    StopPending = "StopPending",
    Loading = "Loading",
    RecordingFailed = "RecordingFailed"
}
export declare enum ViewMode {
    FlameChart = "FlameChart",
    BottomUp = "BottomUp",
    CallTree = "CallTree",
    EventLog = "EventLog"
}
export declare const rowHeight = 18;
export declare const headerHeight = 20;
export declare class TimelineSelection {
    private readonly typeInternal;
    private readonly startTimeInternal;
    readonly endTimeInternal: number;
    private readonly objectInternal;
    constructor(type: string, startTime: number, endTime: number, object?: Object);
    static fromFrame(frame: TimelineModel.TimelineFrameModel.TimelineFrame): TimelineSelection;
    static fromNetworkRequest(request: TimelineModel.TimelineModel.NetworkRequest): TimelineSelection;
    static fromTraceEvent(event: SDK.TracingModel.Event): TimelineSelection;
    static fromRange(startTime: number, endTime: number): TimelineSelection;
    type(): string;
    object(): Object | null;
    startTime(): number;
    endTime(): number;
}
export declare namespace TimelineSelection {
    enum Type {
        Frame = "Frame",
        NetworkRequest = "NetworkRequest",
        TraceEvent = "TraceEvent",
        Range = "Range"
    }
}
export interface TimelineModeViewDelegate {
    select(selection: TimelineSelection | null): void;
    selectEntryAtTime(events: SDK.TracingModel.Event[] | null, time: number): void;
    highlightEvent(event: SDK.TracingModel.Event | null): void;
}
export declare class StatusPane extends UI.Widget.VBox {
    private status;
    private time;
    private progressLabel;
    private progressBar;
    private readonly description;
    private button;
    private startTime;
    private timeUpdateTimer?;
    constructor(options: {
        showTimer?: boolean;
        showProgress?: boolean;
        description?: string;
        buttonText?: string;
        buttonDisabled?: boolean;
    }, buttonCallback: () => (Promise<void> | void));
    finish(): void;
    remove(): void;
    showPane(parent: Element): void;
    enableAndFocusButton(): void;
    updateStatus(text: string): void;
    updateProgressBar(activity: string, percent: number): void;
    startTimer(): void;
    private stopTimer;
    private updateTimer;
    private arrangeDialog;
    wasShown(): void;
}
export declare class LoadTimelineHandler implements Common.QueryParamHandler.QueryParamHandler {
    static instance(opts?: {
        forceNew: boolean | null;
    }): LoadTimelineHandler;
    handleQueryParam(value: string): void;
}
export declare class ActionDelegate implements UI.ActionRegistration.ActionDelegate {
    static instance(opts?: {
        forceNew: boolean | null;
    } | undefined): ActionDelegate;
    handleAction(context: UI.Context.Context, actionId: string): boolean;
}

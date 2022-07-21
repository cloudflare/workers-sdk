import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as TimelineModel from '../../models/timeline_model/timeline_model.js';
import * as PerfUI from '../../ui/legacy/components/perf_ui/perf_ui.js';
import type { PerformanceModel } from './PerformanceModel.js';
import { TimelineSelection } from './TimelinePanel.js';
declare type TimelineFlameChartEntry = (SDK.FilmStripModel.Frame | SDK.TracingModel.Event | TimelineModel.TimelineFrameModel.TimelineFrame | TimelineModel.TimelineIRModel.Phases);
export declare class TimelineFlameChartDataProvider extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements PerfUI.FlameChart.FlameChartDataProvider {
    private readonly font;
    private droppedFramePatternCanvas;
    private partialFramePatternCanvas;
    private timelineDataInternal;
    private currentLevel;
    private performanceModel;
    private model;
    private minimumBoundaryInternal;
    private readonly maximumBoundary;
    private timeSpan;
    private readonly consoleColorGenerator;
    private readonly extensionColorGenerator;
    private readonly headerLevel1;
    private readonly headerLevel2;
    private readonly staticHeader;
    private framesHeader;
    private readonly collapsibleTimingsHeader;
    private readonly timingsHeader;
    private readonly screenshotsHeader;
    private readonly animationsHeader;
    private readonly experienceHeader;
    private readonly flowEventIndexById;
    private entryData;
    private entryTypeByLevel;
    private markers;
    private asyncColorByInteractionPhase;
    private screenshotImageCache;
    private extensionInfo;
    private entryIndexToTitle;
    private asyncColorByCategory;
    private lastInitiatorEntry;
    private entryParent;
    private frameGroup?;
    private lastSelection?;
    private colorForEvent?;
    constructor();
    private buildGroupStyle;
    setModel(performanceModel: PerformanceModel | null): void;
    groupTrack(group: PerfUI.FlameChart.Group): TimelineModel.TimelineModel.Track | null;
    navStartTimes(): Map<any, any>;
    entryTitle(entryIndex: number): string | null;
    textColor(index: number): string;
    entryFont(_index: number): string | null;
    reset(): void;
    maxStackDepth(): number;
    timelineData(): PerfUI.FlameChart.TimelineData;
    private processGenericTrace;
    private processInspectorTrace;
    minimumBoundary(): number;
    totalTime(): number;
    search(startTime: number, endTime: number, filter: TimelineModel.TimelineModelFilter.TimelineModelFilter): number[];
    private appendSyncEvents;
    private isIgnoreListedEvent;
    private isIgnoreListedURL;
    private appendAsyncEventsGroup;
    private appendInteractionRecords;
    private appendPageMetrics;
    /**
     * This function pushes a copy of each performance.mark() event from the Main track
     * into Timings so they can be appended to the performance UI.
     * Performance.mark() are a part of the "blink.user_timing" category alongside
     * Navigation and Resource Timing events, so we must filter them out before pushing.
     */
    private copyPerfMarkEvents;
    private appendFrames;
    private entryType;
    prepareHighlightedEntryInfo(entryIndex: number): Element | null;
    entryColor(entryIndex: number): string;
    private genericTraceEventColor;
    private preparePatternCanvas;
    private drawFrame;
    private drawScreenshot;
    decorateEntry(entryIndex: number, context: CanvasRenderingContext2D, text: string | null, barX: number, barY: number, barWidth: number, barHeight: number, unclippedBarX: number, timeToPixels: number): boolean;
    forceDecoration(entryIndex: number): boolean;
    appendExtensionEvents(entry: {
        title: string;
        model: SDK.TracingModel.TracingModel;
    }): void;
    private innerAppendExtensionEvents;
    private appendHeader;
    private appendEvent;
    private appendAsyncEvent;
    private appendFrame;
    createSelection(entryIndex: number): TimelineSelection | null;
    formatValue(value: number, precision?: number): string;
    canJumpToEntry(_entryIndex: number): boolean;
    entryIndexForSelection(selection: TimelineSelection | null): number;
    buildFlowForInitiator(entryIndex: number): boolean;
    private eventParent;
    eventByIndex(entryIndex: number): SDK.TracingModel.Event | null;
    entryDataByIndex(entryIndex: number): TimelineFlameChartEntry;
    setEventColorMapping(colorForEvent: (arg0: SDK.TracingModel.Event) => string): void;
}
export declare const InstantEventVisibleDurationMs = 0.001;
export declare enum Events {
    DataChanged = "DataChanged"
}
export declare type EventTypes = {
    [Events.DataChanged]: void;
};
export declare enum EntryType {
    Frame = "Frame",
    Event = "Event",
    InteractionRecord = "InteractionRecord",
    ExtensionEvent = "ExtensionEvent",
    Screenshot = "Screenshot"
}
export {};

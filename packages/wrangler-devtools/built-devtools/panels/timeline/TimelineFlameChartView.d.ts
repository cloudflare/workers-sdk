import * as SDK from '../../core/sdk/sdk.js';
import * as PerfUI from '../../ui/legacy/components/perf_ui/perf_ui.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { PerformanceModel } from './PerformanceModel.js';
import type { TimelineModeViewDelegate } from './TimelinePanel.js';
import { TimelineSelection } from './TimelinePanel.js';
import type { TimelineMarkerStyle } from './TimelineUIUtils.js';
export declare class TimelineFlameChartView extends UI.Widget.VBox implements PerfUI.FlameChart.FlameChartDelegate, UI.SearchableView.Searchable {
    private readonly delegate;
    private model;
    private searchResults;
    private eventListeners;
    private readonly showMemoryGraphSetting;
    private readonly showWebVitalsSetting;
    private readonly networkSplitWidget;
    private mainDataProvider;
    private readonly mainFlameChart;
    private readonly networkFlameChartGroupExpansionSetting;
    private networkDataProvider;
    private readonly networkFlameChart;
    private readonly networkPane;
    private readonly splitResizer;
    private readonly webVitals;
    private readonly mainSplitWidget;
    private readonly chartSplitWidget;
    private readonly countersView;
    private readonly detailsSplitWidget;
    private readonly detailsView;
    private readonly onMainEntrySelected;
    private readonly onNetworkEntrySelected;
    private nextExtensionIndex;
    private readonly boundRefresh;
    private selectedTrack;
    private readonly groupBySetting;
    private searchableView;
    private urlToColorCache?;
    private needsResizeToPreferredHeights?;
    private selectedSearchResult?;
    private searchRegex?;
    constructor(delegate: TimelineModeViewDelegate);
    toggleWebVitalsLane(): void;
    private updateColorMapper;
    private onWindowChanged;
    windowChanged(windowStartTime: number, windowEndTime: number, animate: boolean): void;
    updateRangeSelection(startTime: number, endTime: number): void;
    updateSelectedGroup(flameChart: PerfUI.FlameChart.FlameChart, group: PerfUI.FlameChart.Group | null): void;
    setModel(model: PerformanceModel | null): void;
    private updateTrack;
    private refresh;
    private appendExtensionData;
    private onEntryHighlighted;
    highlightEvent(event: SDK.TracingModel.Event | null): void;
    willHide(): void;
    wasShown(): void;
    private updateCountersGraphToggle;
    setSelection(selection: TimelineSelection | null): void;
    private onEntrySelected;
    resizeToPreferredHeights(): void;
    setSearchableView(searchableView: UI.SearchableView.SearchableView): void;
    jumpToNextSearchResult(): void;
    jumpToPreviousSearchResult(): void;
    supportsCaseSensitiveSearch(): boolean;
    supportsRegexSearch(): boolean;
    private selectSearchResult;
    private updateSearchResults;
    searchCanceled(): void;
    performSearch(searchConfig: UI.SearchableView.SearchConfig, shouldJump: boolean, jumpBackwards?: boolean): void;
}
export declare class Selection {
    timelineSelection: TimelineSelection;
    entryIndex: number;
    constructor(selection: TimelineSelection, entryIndex: number);
}
export declare const FlameChartStyle: {
    textColor: string;
};
export declare class TimelineFlameChartMarker implements PerfUI.FlameChart.FlameChartMarker {
    private readonly startTimeInternal;
    private readonly startOffset;
    private style;
    constructor(startTime: number, startOffset: number, style: TimelineMarkerStyle);
    startTime(): number;
    color(): string;
    title(): string | null;
    draw(context: CanvasRenderingContext2D, x: number, height: number, pixelsPerMillisecond: number): void;
}
export declare enum ColorBy {
    URL = "URL"
}

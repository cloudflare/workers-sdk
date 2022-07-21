import * as TimelineModel from '../../models/timeline_model/timeline_model.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { PerformanceModel } from './PerformanceModel.js';
import type { TimelineModeViewDelegate } from './TimelinePanel.js';
import { TimelineSelection } from './TimelinePanel.js';
export declare class TimelineDetailsView extends UI.Widget.VBox {
    private readonly detailsLinkifier;
    private tabbedPane;
    private readonly defaultDetailsWidget;
    private readonly defaultDetailsContentElement;
    private rangeDetailViews;
    private readonly additionalMetricsToolbar;
    private model;
    private track?;
    private lazyPaintProfilerView?;
    private lazyLayersView?;
    private preferredTabId?;
    private selection?;
    constructor(delegate: TimelineModeViewDelegate);
    setModel(model: PerformanceModel | null, track: TimelineModel.TimelineModel.Track | null): void;
    private setContent;
    private updateContents;
    private appendTab;
    headerElement(): Element;
    setPreferredTab(tabId: string): void;
    private onWindowChanged;
    private updateContentsFromWindow;
    setSelection(selection: TimelineSelection | null): void;
    private tabSelected;
    private layersView;
    private paintProfilerView;
    private showSnapshotInPaintProfiler;
    private appendDetailsTabsForTraceEventAndShowDetails;
    private showEventInPaintProfiler;
    private updateSelectedRangeStats;
}
export declare enum Tab {
    Details = "Details",
    EventLog = "EventLog",
    CallTree = "CallTree",
    BottomUp = "BottomUp",
    PaintProfiler = "PaintProfiler",
    LayerViewer = "LayerViewer"
}

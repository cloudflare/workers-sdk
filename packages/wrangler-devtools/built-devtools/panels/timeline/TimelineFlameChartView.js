// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Bindings from '../../models/bindings/bindings.js';
import * as TimelineModel from '../../models/timeline_model/timeline_model.js';
import * as PerfUI from '../../ui/legacy/components/perf_ui/perf_ui.js';
import * as UI from '../../ui/legacy/legacy.js';
import { CountersGraph } from './CountersGraph.js';
import { Events as PerformanceModelEvents } from './PerformanceModel.js';
import { TimelineDetailsView } from './TimelineDetailsView.js';
import { TimelineRegExp } from './TimelineFilters.js';
import { Events as TimelineFlameChartDataProviderEvents, TimelineFlameChartDataProvider, } from './TimelineFlameChartDataProvider.js';
import { TimelineFlameChartNetworkDataProvider } from './TimelineFlameChartNetworkDataProvider.js';
import { TimelineSelection } from './TimelinePanel.js';
import { AggregatedTimelineTreeView } from './TimelineTreeView.js';
import { TimelineUIUtils } from './TimelineUIUtils.js';
import { WebVitalsIntegrator } from './WebVitalsTimelineUtils.js';
const UIStrings = {
    /**
    *@description Text in Timeline Flame Chart View of the Performance panel
    *@example {Frame} PH1
    *@example {10ms} PH2
    */
    sAtS: '{PH1} at {PH2}',
};
const str_ = i18n.i18n.registerUIStrings('panels/timeline/TimelineFlameChartView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
class MainSplitWidget extends UI.SplitWidget.SplitWidget {
    webVitals;
    model;
    constructor(isVertical, secondIsSidebar, settingName, defaultSidebarWidth, defaultSidebarHeight, constraintsInDip) {
        super(isVertical, secondIsSidebar, settingName, defaultSidebarWidth, defaultSidebarHeight, constraintsInDip);
    }
    setWebVitals(webVitals) {
        this.webVitals = webVitals;
        this.webVitals.setMinimumSize(0, 120);
    }
    setWindowTimes(left, right, animate) {
        if (!this.webVitals) {
            return;
        }
        const startTime = left - (this.model ? this.model.timelineModel().minimumRecordTime() : 0);
        this.webVitals.chartViewport.setWindowTimes(left, right, animate);
        this.webVitals.webVitalsTimeline.data = {
            startTime: startTime,
            duration: right - left,
            fcps: undefined,
            lcps: undefined,
            layoutShifts: undefined,
            longTasks: undefined,
            mainFrameNavigations: undefined,
            maxDuration: undefined,
        };
    }
    setModelAndUpdateBoundaries(model) {
        this.model = model;
        if (!this.webVitals || !model) {
            return;
        }
        const left = model.window().left;
        const right = model.window().right;
        const timelineModel = model.timelineModel();
        const events = timelineModel.tracks().reduce((prev, curr) => prev.concat(curr.events), []);
        const minimumBoundary = model.timelineModel().minimumRecordTime();
        const prepareEvents = (filterFunction) => events.filter(filterFunction).map(e => e.startTime - minimumBoundary);
        const lcpEvents = events.filter(e => timelineModel.isLCPCandidateEvent(e) || timelineModel.isLCPInvalidateEvent(e));
        const lcpEventsByNavigationId = new Map();
        for (const e of lcpEvents) {
            const navigationId = e.args['data']['navigationId'];
            const previousLastEvent = lcpEventsByNavigationId.get(navigationId);
            if (!previousLastEvent || previousLastEvent.args['data']['candidateIndex'] < e.args['data']['candidateIndex']) {
                lcpEventsByNavigationId.set(navigationId, e);
            }
        }
        const latestLcpCandidatesByNavigationId = Array.from(lcpEventsByNavigationId.values());
        const latestLcpEvents = latestLcpCandidatesByNavigationId.filter(e => timelineModel.isLCPCandidateEvent(e));
        const longTasks = events.filter(e => SDK.TracingModel.TracingModel.isCompletePhase(e.phase) && timelineModel.isLongRunningTask(e))
            .map(e => ({ start: e.startTime - minimumBoundary, duration: e.duration || 0 }));
        this.webVitals.chartViewport.setBoundaries(left, right - left);
        this.webVitals.chartViewport.setWindowTimes(left, right);
        const startTime = left - (this.model ? this.model.timelineModel().minimumRecordTime() : 0);
        this.webVitals.webVitalsTimeline.data = {
            startTime: startTime,
            duration: right - left,
            maxDuration: timelineModel.maximumRecordTime(),
            fcps: events.filter(e => timelineModel.isFCPEvent(e)).map(e => ({ timestamp: e.startTime - minimumBoundary, e })),
            lcps: latestLcpEvents.map(e => e.startTime).map(t => ({ timestamp: t - minimumBoundary })),
            layoutShifts: prepareEvents(e => timelineModel.isLayoutShiftEvent(e)).map(t => ({ timestamp: t })),
            longTasks,
            mainFrameNavigations: prepareEvents(e => timelineModel.isMainFrameNavigationStartEvent(e)),
        };
    }
}
export class TimelineFlameChartView extends UI.Widget.VBox {
    delegate;
    model;
    searchResults;
    eventListeners;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    showMemoryGraphSetting;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    showWebVitalsSetting;
    networkSplitWidget;
    mainDataProvider;
    mainFlameChart;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    networkFlameChartGroupExpansionSetting;
    networkDataProvider;
    networkFlameChart;
    networkPane;
    splitResizer;
    webVitals;
    mainSplitWidget;
    chartSplitWidget;
    countersView;
    detailsSplitWidget;
    detailsView;
    onMainEntrySelected;
    onNetworkEntrySelected;
    nextExtensionIndex;
    boundRefresh;
    selectedTrack;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    groupBySetting;
    searchableView;
    urlToColorCache;
    needsResizeToPreferredHeights;
    selectedSearchResult;
    searchRegex;
    constructor(delegate) {
        super();
        this.element.classList.add('timeline-flamechart');
        this.delegate = delegate;
        this.model = null;
        this.eventListeners = [];
        this.showMemoryGraphSetting = Common.Settings.Settings.instance().createSetting('timelineShowMemory', false);
        this.showWebVitalsSetting = Common.Settings.Settings.instance().createSetting('timelineWebVitals', false);
        // Create main and network flamecharts.
        this.networkSplitWidget = new UI.SplitWidget.SplitWidget(false, false, 'timelineFlamechartMainView', 150);
        // Ensure that the network panel & resizer appears above the web vitals / main thread.
        this.networkSplitWidget.sidebarElement().style.zIndex = '120';
        const mainViewGroupExpansionSetting = Common.Settings.Settings.instance().createSetting('timelineFlamechartMainViewGroupExpansion', {});
        this.mainDataProvider = new TimelineFlameChartDataProvider();
        this.mainDataProvider.addEventListener(TimelineFlameChartDataProviderEvents.DataChanged, () => this.mainFlameChart.scheduleUpdate());
        this.mainFlameChart = new PerfUI.FlameChart.FlameChart(this.mainDataProvider, this, mainViewGroupExpansionSetting);
        this.mainFlameChart.alwaysShowVerticalScroll();
        this.mainFlameChart.enableRuler(false);
        this.networkFlameChartGroupExpansionSetting =
            Common.Settings.Settings.instance().createSetting('timelineFlamechartNetworkViewGroupExpansion', {});
        this.networkDataProvider = new TimelineFlameChartNetworkDataProvider();
        this.networkFlameChart =
            new PerfUI.FlameChart.FlameChart(this.networkDataProvider, this, this.networkFlameChartGroupExpansionSetting);
        this.networkFlameChart.alwaysShowVerticalScroll();
        this.networkFlameChart.disableRangeSelection();
        this.networkPane = new UI.Widget.VBox();
        this.networkPane.setMinimumSize(23, 23);
        this.networkFlameChart.show(this.networkPane.element);
        this.splitResizer = this.networkPane.element.createChild('div', 'timeline-flamechart-resizer');
        this.networkSplitWidget.hideDefaultResizer(true);
        this.networkSplitWidget.installResizer(this.splitResizer);
        this.webVitals = new WebVitalsIntegrator(this);
        this.mainSplitWidget = new MainSplitWidget(false, false, 'timelineFlamechartMainAndVitalsView', undefined, 120);
        this.mainSplitWidget.setWebVitals(this.webVitals);
        this.mainSplitWidget.setMainWidget(this.mainFlameChart);
        this.mainSplitWidget.setSidebarWidget(this.webVitals);
        this.toggleWebVitalsLane();
        this.networkSplitWidget.setMainWidget(this.mainSplitWidget);
        this.networkSplitWidget.setSidebarWidget(this.networkPane);
        // Create counters chart splitter.
        this.chartSplitWidget = new UI.SplitWidget.SplitWidget(false, true, 'timelineCountersSplitViewState');
        this.countersView = new CountersGraph(this.delegate);
        this.chartSplitWidget.setMainWidget(this.networkSplitWidget);
        this.chartSplitWidget.setSidebarWidget(this.countersView);
        this.chartSplitWidget.hideDefaultResizer();
        this.chartSplitWidget.installResizer(this.countersView.resizerElement());
        this.updateCountersGraphToggle();
        // Create top level properties splitter.
        this.detailsSplitWidget = new UI.SplitWidget.SplitWidget(false, true, 'timelinePanelDetailsSplitViewState');
        this.detailsSplitWidget.element.classList.add('timeline-details-split');
        this.detailsView = new TimelineDetailsView(delegate);
        this.detailsSplitWidget.installResizer(this.detailsView.headerElement());
        this.detailsSplitWidget.setMainWidget(this.chartSplitWidget);
        this.detailsSplitWidget.setSidebarWidget(this.detailsView);
        this.detailsSplitWidget.show(this.element);
        this.onMainEntrySelected = this.onEntrySelected.bind(this, this.mainDataProvider);
        this.onNetworkEntrySelected = this.onEntrySelected.bind(this, this.networkDataProvider);
        this.mainFlameChart.addEventListener(PerfUI.FlameChart.Events.EntrySelected, this.onMainEntrySelected, this);
        this.mainFlameChart.addEventListener(PerfUI.FlameChart.Events.EntryInvoked, this.onMainEntrySelected, this);
        this.networkFlameChart.addEventListener(PerfUI.FlameChart.Events.EntrySelected, this.onNetworkEntrySelected, this);
        this.networkFlameChart.addEventListener(PerfUI.FlameChart.Events.EntryInvoked, this.onNetworkEntrySelected, this);
        this.mainFlameChart.addEventListener(PerfUI.FlameChart.Events.EntryHighlighted, this.onEntryHighlighted, this);
        this.nextExtensionIndex = 0;
        this.boundRefresh = this.refresh.bind(this);
        this.selectedTrack = null;
        this.mainDataProvider.setEventColorMapping(TimelineUIUtils.eventColor);
        this.groupBySetting = Common.Settings.Settings.instance().createSetting('timelineTreeGroupBy', AggregatedTimelineTreeView.GroupBy.None);
        this.groupBySetting.addChangeListener(this.updateColorMapper, this);
        this.updateColorMapper();
    }
    toggleWebVitalsLane() {
        if (this.showWebVitalsSetting.get()) {
            this.mainSplitWidget.showBoth();
            this.mainSplitWidget.setSidebarSize(120);
            this.mainSplitWidget.setResizable(false);
            this.mainSplitWidget.hideDefaultResizer(true);
        }
        else {
            this.mainSplitWidget.hideSidebar();
        }
    }
    updateColorMapper() {
        this.urlToColorCache = new Map();
        if (!this.model) {
            return;
        }
        this.mainDataProvider.setEventColorMapping(TimelineUIUtils.eventColor);
        this.mainFlameChart.update();
    }
    onWindowChanged(event) {
        const { window, animate } = event.data;
        this.mainFlameChart.setWindowTimes(window.left, window.right, animate);
        this.networkFlameChart.setWindowTimes(window.left, window.right, animate);
        this.networkDataProvider.setWindowTimes(window.left, window.right);
        this.mainSplitWidget.setWindowTimes(window.left, window.right, Boolean(animate));
        this.updateSearchResults(false, false);
    }
    windowChanged(windowStartTime, windowEndTime, animate) {
        if (this.model) {
            this.model.setWindow({ left: windowStartTime, right: windowEndTime }, animate);
        }
    }
    updateRangeSelection(startTime, endTime) {
        this.delegate.select(TimelineSelection.fromRange(startTime, endTime));
    }
    updateSelectedGroup(flameChart, group) {
        if (flameChart !== this.mainFlameChart) {
            return;
        }
        const track = group ? this.mainDataProvider.groupTrack(group) : null;
        this.selectedTrack = track;
        this.updateTrack();
    }
    setModel(model) {
        if (model === this.model) {
            return;
        }
        Common.EventTarget.removeEventListeners(this.eventListeners);
        this.model = model;
        this.selectedTrack = null;
        this.mainDataProvider.setModel(this.model);
        this.networkDataProvider.setModel(this.model);
        if (this.model) {
            this.eventListeners = [
                this.model.addEventListener(PerformanceModelEvents.WindowChanged, this.onWindowChanged, this),
                this.model.addEventListener(PerformanceModelEvents.ExtensionDataAdded, this.appendExtensionData, this),
            ];
            const window = this.model.window();
            this.mainFlameChart.setWindowTimes(window.left, window.right);
            this.networkFlameChart.setWindowTimes(window.left, window.right);
            this.networkDataProvider.setWindowTimes(window.left, window.right);
            this.mainSplitWidget.setModelAndUpdateBoundaries(model);
            this.updateSearchResults(false, false);
        }
        this.updateColorMapper();
        this.updateTrack();
        this.nextExtensionIndex = 0;
        this.appendExtensionData();
        this.refresh();
    }
    updateTrack() {
        this.countersView.setModel(this.model, this.selectedTrack);
        this.detailsView.setModel(this.model, this.selectedTrack);
    }
    refresh() {
        if (this.networkDataProvider.isEmpty()) {
            this.mainFlameChart.enableRuler(true);
            this.networkSplitWidget.hideSidebar();
        }
        else {
            this.mainFlameChart.enableRuler(false);
            this.networkSplitWidget.showBoth();
            this.resizeToPreferredHeights();
        }
        this.mainFlameChart.reset();
        this.networkFlameChart.reset();
        this.updateSearchResults(false, false);
    }
    appendExtensionData() {
        if (!this.model) {
            return;
        }
        const extensions = this.model.extensionInfo();
        while (this.nextExtensionIndex < extensions.length) {
            this.mainDataProvider.appendExtensionEvents(extensions[this.nextExtensionIndex++]);
        }
        this.mainFlameChart.scheduleUpdate();
    }
    onEntryHighlighted(commonEvent) {
        SDK.OverlayModel.OverlayModel.hideDOMNodeHighlight();
        const entryIndex = commonEvent.data;
        const event = this.mainDataProvider.eventByIndex(entryIndex);
        if (!event) {
            return;
        }
        const target = this.model && this.model.timelineModel().targetByEvent(event);
        if (!target) {
            return;
        }
        const timelineData = TimelineModel.TimelineModel.TimelineData.forEvent(event);
        const backendNodeIds = timelineData.backendNodeIds;
        if (!backendNodeIds) {
            return;
        }
        for (let i = 0; i < backendNodeIds.length; ++i) {
            new SDK.DOMModel.DeferredDOMNode(target, backendNodeIds[i]).highlight();
        }
    }
    highlightEvent(event) {
        const entryIndex = event ? this.mainDataProvider.entryIndexForSelection(TimelineSelection.fromTraceEvent(event)) : -1;
        if (entryIndex >= 0) {
            this.mainFlameChart.highlightEntry(entryIndex);
        }
        else {
            this.mainFlameChart.hideHighlight();
        }
    }
    willHide() {
        this.networkFlameChartGroupExpansionSetting.removeChangeListener(this.resizeToPreferredHeights, this);
        this.showMemoryGraphSetting.removeChangeListener(this.updateCountersGraphToggle, this);
        Bindings.IgnoreListManager.IgnoreListManager.instance().removeChangeListener(this.boundRefresh);
    }
    wasShown() {
        this.networkFlameChartGroupExpansionSetting.addChangeListener(this.resizeToPreferredHeights, this);
        this.showMemoryGraphSetting.addChangeListener(this.updateCountersGraphToggle, this);
        Bindings.IgnoreListManager.IgnoreListManager.instance().addChangeListener(this.boundRefresh);
        if (this.needsResizeToPreferredHeights) {
            this.resizeToPreferredHeights();
        }
        this.mainFlameChart.scheduleUpdate();
        this.networkFlameChart.scheduleUpdate();
    }
    updateCountersGraphToggle() {
        if (this.showMemoryGraphSetting.get()) {
            this.chartSplitWidget.showBoth();
        }
        else {
            this.chartSplitWidget.hideSidebar();
        }
    }
    setSelection(selection) {
        let index = this.mainDataProvider.entryIndexForSelection(selection);
        this.mainFlameChart.setSelectedEntry(index);
        index = this.networkDataProvider.entryIndexForSelection(selection);
        this.networkFlameChart.setSelectedEntry(index);
        if (this.detailsView) {
            this.detailsView.setSelection(selection);
        }
    }
    onEntrySelected(dataProvider, event) {
        const entryIndex = event.data;
        if (Root.Runtime.experiments.isEnabled('timelineEventInitiators') && dataProvider === this.mainDataProvider) {
            if (this.mainDataProvider.buildFlowForInitiator(entryIndex)) {
                this.mainFlameChart.scheduleUpdate();
            }
        }
        this.delegate.select(dataProvider.createSelection(entryIndex));
    }
    resizeToPreferredHeights() {
        if (!this.isShowing()) {
            this.needsResizeToPreferredHeights = true;
            return;
        }
        this.needsResizeToPreferredHeights = false;
        this.networkPane.element.classList.toggle('timeline-network-resizer-disabled', !this.networkDataProvider.isExpanded());
        this.networkSplitWidget.setSidebarSize(this.networkDataProvider.preferredHeight() + this.splitResizer.clientHeight + PerfUI.FlameChart.HeaderHeight +
            2);
    }
    setSearchableView(searchableView) {
        this.searchableView = searchableView;
    }
    // UI.SearchableView.Searchable implementation
    jumpToNextSearchResult() {
        if (!this.searchResults || !this.searchResults.length) {
            return;
        }
        const index = typeof this.selectedSearchResult !== 'undefined' ? this.searchResults.indexOf(this.selectedSearchResult) : -1;
        this.selectSearchResult(Platform.NumberUtilities.mod(index + 1, this.searchResults.length));
    }
    jumpToPreviousSearchResult() {
        if (!this.searchResults || !this.searchResults.length) {
            return;
        }
        const index = typeof this.selectedSearchResult !== 'undefined' ? this.searchResults.indexOf(this.selectedSearchResult) : 0;
        this.selectSearchResult(Platform.NumberUtilities.mod(index - 1, this.searchResults.length));
    }
    supportsCaseSensitiveSearch() {
        return true;
    }
    supportsRegexSearch() {
        return true;
    }
    selectSearchResult(index) {
        this.searchableView.updateCurrentMatchIndex(index);
        if (this.searchResults) {
            this.selectedSearchResult = this.searchResults[index];
            this.delegate.select(this.mainDataProvider.createSelection(this.selectedSearchResult));
        }
    }
    updateSearchResults(shouldJump, jumpBackwards) {
        const oldSelectedSearchResult = this.selectedSearchResult;
        delete this.selectedSearchResult;
        this.searchResults = [];
        if (!this.searchRegex || !this.model) {
            return;
        }
        const regExpFilter = new TimelineRegExp(this.searchRegex);
        const window = this.model.window();
        this.searchResults = this.mainDataProvider.search(window.left, window.right, regExpFilter);
        this.searchableView.updateSearchMatchesCount(this.searchResults.length);
        if (!shouldJump || !this.searchResults.length) {
            return;
        }
        let selectedIndex = this.searchResults.indexOf(oldSelectedSearchResult);
        if (selectedIndex === -1) {
            selectedIndex = jumpBackwards ? this.searchResults.length - 1 : 0;
        }
        this.selectSearchResult(selectedIndex);
    }
    searchCanceled() {
        if (typeof this.selectedSearchResult !== 'undefined') {
            this.delegate.select(null);
        }
        delete this.searchResults;
        delete this.selectedSearchResult;
        delete this.searchRegex;
    }
    performSearch(searchConfig, shouldJump, jumpBackwards) {
        this.searchRegex = searchConfig.toSearchRegex().regex;
        this.updateSearchResults(shouldJump, jumpBackwards);
    }
}
export class Selection {
    timelineSelection;
    entryIndex;
    constructor(selection, entryIndex) {
        this.timelineSelection = selection;
        this.entryIndex = entryIndex;
    }
}
export const FlameChartStyle = {
    textColor: '#333',
};
export class TimelineFlameChartMarker {
    startTimeInternal;
    startOffset;
    style;
    constructor(startTime, startOffset, style) {
        this.startTimeInternal = startTime;
        this.startOffset = startOffset;
        this.style = style;
    }
    startTime() {
        return this.startTimeInternal;
    }
    color() {
        return this.style.color;
    }
    title() {
        if (this.style.lowPriority) {
            return null;
        }
        const startTime = i18n.TimeUtilities.millisToString(this.startOffset);
        return i18nString(UIStrings.sAtS, { PH1: this.style.title, PH2: startTime });
    }
    draw(context, x, height, pixelsPerMillisecond) {
        const lowPriorityVisibilityThresholdInPixelsPerMs = 4;
        if (this.style.lowPriority && pixelsPerMillisecond < lowPriorityVisibilityThresholdInPixelsPerMs) {
            return;
        }
        context.save();
        if (this.style.tall) {
            context.strokeStyle = this.style.color;
            context.lineWidth = this.style.lineWidth;
            context.translate(this.style.lineWidth < 1 || (this.style.lineWidth & 1) ? 0.5 : 0, 0.5);
            context.beginPath();
            context.moveTo(x, 0);
            context.setLineDash(this.style.dashStyle);
            context.lineTo(x, context.canvas.height);
            context.stroke();
        }
        context.restore();
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var ColorBy;
(function (ColorBy) {
    ColorBy["URL"] = "URL";
})(ColorBy || (ColorBy = {}));
//# sourceMappingURL=TimelineFlameChartView.js.map
/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Bindings from '../../models/bindings/bindings.js';
import * as HeapSnapshotModel from '../../models/heap_snapshot_model/heap_snapshot_model.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as ObjectUI from '../../ui/legacy/components/object_ui/object_ui.js';
import * as PerfUI from '../../ui/legacy/components/perf_ui/perf_ui.js';
import * as Components from '../../ui/legacy/components/utils/utils.js';
import * as UI from '../../ui/legacy/legacy.js';
import { AllocationDataGrid, HeapSnapshotSortableDataGridEvents, HeapSnapshotConstructorsDataGrid, HeapSnapshotDiffDataGrid, HeapSnapshotRetainmentDataGrid, HeapSnapshotContainmentDataGrid, } from './HeapSnapshotDataGrids.js';
import { HeapSnapshotGenericObjectNode } from './HeapSnapshotGridNodes.js';
import { HeapSnapshotWorkerProxy } from './HeapSnapshotProxy.js';
import { HeapTimelineOverview, Samples } from './HeapTimelineOverview.js';
import * as ModuleUIStrings from './ModuleUIStrings.js';
import { Events as ProfileHeaderEvents, ProfileEvents as ProfileTypeEvents, ProfileHeader, ProfileType, } from './ProfileHeader.js';
import { ProfileSidebarTreeElement } from './ProfileSidebarTreeElement.js';
import { instance } from './ProfileTypeRegistry.js';
const UIStrings = {
    /**
    *@description Text to find an item
    */
    find: 'Find',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    */
    containment: 'Containment',
    /**
    *@description Retaining paths title text content in Heap Snapshot View of a profiler tool
    */
    retainers: 'Retainers',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    */
    allocationStack: 'Allocation stack',
    /**
    *@description Screen reader label for a select box that chooses the perspective in the Memory panel when vieweing a Heap Snapshot
    */
    perspective: 'Perspective',
    /**
    *@description Screen reader label for a select box that chooses the snapshot to use as a base in the Memory panel when vieweing a Heap Snapshot
    */
    baseSnapshot: 'Base snapshot',
    /**
    *@description Text to filter result items
    */
    filter: 'Filter',
    /**
    * @description Filter label text in the Memory tool to filter by JavaScript class names for a heap
    * snapshot.
    */
    classFilter: 'Class filter',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    */
    code: 'Code',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    */
    strings: 'Strings',
    /**
    *@description Label on a pie chart in the statistics view for the Heap Snapshot tool
    */
    jsArrays: 'JS arrays',
    /**
    *@description Label on a pie chart in the statistics view for the Heap Snapshot tool
    */
    typedArrays: 'Typed arrays',
    /**
    *@description Label on a pie chart in the statistics view for the Heap Snapshot tool
    */
    systemObjects: 'System objects',
    /**
    *@description The reported total size used in the selected time frame of the allocation sampling profile
    *@example {3 MB} PH1
    */
    selectedSizeS: 'Selected size: {PH1}',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    */
    allObjects: 'All objects',
    /**
    *@description Title in Heap Snapshot View of a profiler tool
    *@example {Profile 2} PH1
    */
    objectsAllocatedBeforeS: 'Objects allocated before {PH1}',
    /**
    *@description Title in Heap Snapshot View of a profiler tool
    *@example {Profile 1} PH1
    *@example {Profile 2} PH2
    */
    objectsAllocatedBetweenSAndS: 'Objects allocated between {PH1} and {PH2}',
    /**
    *@description Text for the summary view
    */
    summary: 'Summary',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    */
    comparison: 'Comparison',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    */
    allocation: 'Allocation',
    /**
    *@description Title text content in Heap Snapshot View of a profiler tool
    */
    liveObjects: 'Live objects',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    */
    statistics: 'Statistics',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    */
    heapSnapshot: 'Heap snapshot',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    */
    takeHeapSnapshot: 'Take heap snapshot',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    */
    heapSnapshots: 'HEAP SNAPSHOTS',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    */
    heapSnapshotProfilesShowMemory: 'Heap snapshot profiles show memory distribution among your page\'s JavaScript objects and related DOM nodes.',
    /**
    *@description Label for a checkbox in the heap snapshot view of the profiler tool. The "heap snapshot" contains the
    * current state of JavaScript memory. With this checkbox enabled, the snapshot also includes internal data that is
    * specific to Chrome (hence implementation-specific).
    */
    exposeInternals: 'Expose internals (includes additional implementation-specific details)',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    * This option turns on inclusion of numerical values in the heap snapshot.
    */
    captureNumericValue: 'Include numerical values in capture',
    /**
    *@description Progress update that the profiler is capturing a snapshot of the heap
    */
    snapshotting: 'Snapshotting…',
    /**
    *@description Profile title in Heap Snapshot View of a profiler tool
    *@example {1} PH1
    */
    snapshotD: 'Snapshot {PH1}',
    /**
    *@description Text for a percentage value
    *@example {13.0} PH1
    */
    percentagePlaceholder: '{PH1}%',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    */
    allocationInstrumentationOn: 'Allocation instrumentation on timeline',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    */
    stopRecordingHeapProfile: 'Stop recording heap profile',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    */
    startRecordingHeapProfile: 'Start recording heap profile',
    /**
    *@description Text in Heap Snapshot View of a profiler tool.
    * A stack trace is a list of functions that were called.
    * This option turns on recording of a stack trace at each allocation.
    * The recording itself is a somewhat expensive operation, so turning this option on, the website's performance may be affected negatively (e.g. everything becomes slower).
    */
    recordAllocationStacksExtra: 'Record stack traces of allocations (extra performance overhead)',
    /**
    *@description Text in CPUProfile View of a profiler tool
    */
    recording: 'Recording…',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    */
    allocationTimelines: 'ALLOCATION TIMELINES',
    /**
    *@description Description for the 'Allocation timeline' tool in the Memory panel.
    */
    AllocationTimelinesShowInstrumented: 'Allocation timelines show instrumented JavaScript memory allocations over time. Once profile is recorded you can select a time interval to see objects that were allocated within it and still alive by the end of recording. Use this profile type to isolate memory leaks.',
    /**
    *@description Text when something is loading
    */
    loading: 'Loading…',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    *@example {30} PH1
    */
    savingD: 'Saving… {PH1}%',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    *@example {1,021} PH1
    */
    sKb: '{PH1} kB',
    /**
    *@description Text in Heap Snapshot View of a profiler tool
    */
    heapMemoryUsage: 'Heap memory usage',
    /**
    *@description Text of a DOM element in Heap Snapshot View of a profiler tool
    */
    stackWasNotRecordedForThisObject: 'Stack was not recorded for this object because it had been allocated before this profile recording started.',
};
const str_ = i18n.i18n.registerUIStrings('panels/profiler/HeapSnapshotView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
// The way this is handled is to workaround the strings inside the heap_snapshot_worker
// If strings are removed from inside the worker strings can be declared in this module
// as any other.
// eslint-disable-next-line @typescript-eslint/naming-convention
const moduleUIstr_ = i18n.i18n.registerUIStrings('panels/profiler/ModuleUIStrings.ts', ModuleUIStrings.UIStrings);
const moduleI18nString = i18n.i18n.getLocalizedString.bind(undefined, moduleUIstr_);
export class HeapSnapshotView extends UI.View.SimpleView {
    searchResults;
    profile;
    linkifier;
    parentDataDisplayDelegate;
    searchableViewInternal;
    splitWidget;
    containmentDataGrid;
    containmentWidget;
    statisticsView;
    constructorsDataGrid;
    constructorsWidget;
    diffDataGrid;
    diffWidget;
    allocationDataGrid;
    allocationWidget;
    allocationStackView;
    tabbedPane;
    retainmentDataGrid;
    retainmentWidget;
    objectDetailsView;
    perspectives;
    comparisonPerspective;
    perspectiveSelect;
    baseSelect;
    filterSelect;
    classNameFilter;
    selectedSizeText;
    popoverHelper;
    currentPerspectiveIndex;
    currentPerspective;
    dataGrid;
    searchThrottler;
    baseProfile;
    trackingOverviewGrid;
    currentSearchResultIndex = -1;
    currentQuery;
    constructor(dataDisplayDelegate, profile) {
        super(i18nString(UIStrings.heapSnapshot));
        this.searchResults = [];
        this.element.classList.add('heap-snapshot-view');
        this.profile = profile;
        this.linkifier = new Components.Linkifier.Linkifier();
        const profileType = profile.profileType();
        profileType.addEventListener("SnapshotReceived" /* SnapshotReceived */, this.onReceiveSnapshot, this);
        profileType.addEventListener(ProfileTypeEvents.RemoveProfileHeader, this.onProfileHeaderRemoved, this);
        const isHeapTimeline = profileType.id === TrackingHeapSnapshotProfileType.TypeId;
        if (isHeapTimeline) {
            this.createOverview();
        }
        const hasAllocationStacks = instance.trackingHeapSnapshotProfileType.recordAllocationStacksSetting().get();
        this.parentDataDisplayDelegate = dataDisplayDelegate;
        this.searchableViewInternal = new UI.SearchableView.SearchableView(this, null);
        this.searchableViewInternal.setPlaceholder(i18nString(UIStrings.find), i18nString(UIStrings.find));
        this.searchableViewInternal.show(this.element);
        this.splitWidget = new UI.SplitWidget.SplitWidget(false, true, 'heapSnapshotSplitViewState', 200, 200);
        this.splitWidget.show(this.searchableViewInternal.element);
        const heapProfilerModel = profile.heapProfilerModel();
        this.containmentDataGrid = new HeapSnapshotContainmentDataGrid(heapProfilerModel, this, /* displayName */ i18nString(UIStrings.containment));
        this.containmentDataGrid.addEventListener(DataGrid.DataGrid.Events.SelectedNode, this.selectionChanged, this);
        this.containmentWidget = this.containmentDataGrid.asWidget();
        this.containmentWidget.setMinimumSize(50, 25);
        this.statisticsView = new HeapSnapshotStatisticsView();
        this.constructorsDataGrid = new HeapSnapshotConstructorsDataGrid(heapProfilerModel, this);
        this.constructorsDataGrid.addEventListener(DataGrid.DataGrid.Events.SelectedNode, this.selectionChanged, this);
        this.constructorsWidget = this.constructorsDataGrid.asWidget();
        this.constructorsWidget.setMinimumSize(50, 25);
        this.diffDataGrid = new HeapSnapshotDiffDataGrid(heapProfilerModel, this);
        this.diffDataGrid.addEventListener(DataGrid.DataGrid.Events.SelectedNode, this.selectionChanged, this);
        this.diffWidget = this.diffDataGrid.asWidget();
        this.diffWidget.setMinimumSize(50, 25);
        this.allocationDataGrid = null;
        if (isHeapTimeline && hasAllocationStacks) {
            this.allocationDataGrid = new AllocationDataGrid(heapProfilerModel, this);
            this.allocationDataGrid.addEventListener(DataGrid.DataGrid.Events.SelectedNode, this.onSelectAllocationNode, this);
            this.allocationWidget = this.allocationDataGrid.asWidget();
            this.allocationWidget.setMinimumSize(50, 25);
            this.allocationStackView = new HeapAllocationStackView(heapProfilerModel);
            this.allocationStackView.setMinimumSize(50, 25);
            this.tabbedPane = new UI.TabbedPane.TabbedPane();
        }
        this.retainmentDataGrid = new HeapSnapshotRetainmentDataGrid(heapProfilerModel, this);
        this.retainmentWidget = this.retainmentDataGrid.asWidget();
        this.retainmentWidget.setMinimumSize(50, 21);
        this.retainmentWidget.element.classList.add('retaining-paths-view');
        let splitWidgetResizer;
        if (this.allocationStackView) {
            this.tabbedPane = new UI.TabbedPane.TabbedPane();
            this.tabbedPane.appendTab('retainers', i18nString(UIStrings.retainers), this.retainmentWidget);
            this.tabbedPane.appendTab('allocation-stack', i18nString(UIStrings.allocationStack), this.allocationStackView);
            splitWidgetResizer = this.tabbedPane.headerElement();
            this.objectDetailsView = this.tabbedPane;
        }
        else {
            const retainmentViewHeader = document.createElement('div');
            retainmentViewHeader.classList.add('heap-snapshot-view-resizer');
            const retainingPathsTitleDiv = retainmentViewHeader.createChild('div', 'title');
            retainmentViewHeader.createChild('div', 'verticalResizerIcon');
            const retainingPathsTitle = retainingPathsTitleDiv.createChild('span');
            retainingPathsTitle.textContent = i18nString(UIStrings.retainers);
            splitWidgetResizer = retainmentViewHeader;
            this.objectDetailsView = new UI.Widget.VBox();
            this.objectDetailsView.element.appendChild(retainmentViewHeader);
            this.retainmentWidget.show(this.objectDetailsView.element);
        }
        this.splitWidget.hideDefaultResizer();
        this.splitWidget.installResizer(splitWidgetResizer);
        this.retainmentDataGrid.addEventListener(DataGrid.DataGrid.Events.SelectedNode, this.inspectedObjectChanged, this);
        this.retainmentDataGrid.reset();
        this.perspectives = [];
        this.comparisonPerspective = new ComparisonPerspective();
        this.perspectives.push(new SummaryPerspective());
        if (profile.profileType() !== instance.trackingHeapSnapshotProfileType) {
            this.perspectives.push(this.comparisonPerspective);
        }
        this.perspectives.push(new ContainmentPerspective());
        if (this.allocationWidget) {
            this.perspectives.push(new AllocationPerspective());
        }
        this.perspectives.push(new StatisticsPerspective());
        this.perspectiveSelect =
            new UI.Toolbar.ToolbarComboBox(this.onSelectedPerspectiveChanged.bind(this), i18nString(UIStrings.perspective));
        this.updatePerspectiveOptions();
        this.baseSelect = new UI.Toolbar.ToolbarComboBox(this.changeBase.bind(this), i18nString(UIStrings.baseSnapshot));
        this.baseSelect.setVisible(false);
        this.updateBaseOptions();
        this.filterSelect = new UI.Toolbar.ToolbarComboBox(this.changeFilter.bind(this), i18nString(UIStrings.filter));
        this.filterSelect.setVisible(false);
        this.updateFilterOptions();
        this.classNameFilter = new UI.Toolbar.ToolbarInput(i18nString(UIStrings.classFilter));
        this.classNameFilter.setVisible(false);
        this.constructorsDataGrid.setNameFilter(this.classNameFilter);
        this.diffDataGrid.setNameFilter(this.classNameFilter);
        this.selectedSizeText = new UI.Toolbar.ToolbarText();
        this.popoverHelper = new UI.PopoverHelper.PopoverHelper(this.element, this.getPopoverRequest.bind(this));
        this.popoverHelper.setDisableOnClick(true);
        this.popoverHelper.setHasPadding(true);
        this.element.addEventListener('scroll', this.popoverHelper.hidePopover.bind(this.popoverHelper), true);
        this.currentPerspectiveIndex = 0;
        this.currentPerspective = this.perspectives[0];
        this.currentPerspective.activate(this);
        this.dataGrid = this.currentPerspective.masterGrid(this);
        void this.populate();
        this.searchThrottler = new Common.Throttler.Throttler(0);
        for (const existingProfile of this.profiles()) {
            existingProfile.addEventListener(ProfileHeaderEvents.ProfileTitleChanged, this.updateControls, this);
        }
    }
    createOverview() {
        const profileType = this.profile.profileType();
        this.trackingOverviewGrid = new HeapTimelineOverview();
        this.trackingOverviewGrid.addEventListener("IdsRangeChanged" /* IdsRangeChanged */, this.onIdsRangeChanged.bind(this));
        if (!this.profile.fromFile() && profileType.profileBeingRecorded() === this.profile) {
            profileType
                .addEventListener("HeapStatsUpdate" /* HeapStatsUpdate */, this.onHeapStatsUpdate, this);
            profileType
                .addEventListener("TrackingStopped" /* TrackingStopped */, this.onStopTracking, this);
            this.trackingOverviewGrid.start();
        }
    }
    onStopTracking() {
        const profileType = this.profile.profileType();
        profileType.removeEventListener("HeapStatsUpdate" /* HeapStatsUpdate */, this.onHeapStatsUpdate, this);
        profileType.removeEventListener("TrackingStopped" /* TrackingStopped */, this.onStopTracking, this);
        if (this.trackingOverviewGrid) {
            this.trackingOverviewGrid.stop();
        }
    }
    onHeapStatsUpdate({ data: samples }) {
        if (this.trackingOverviewGrid) {
            this.trackingOverviewGrid.setSamples(samples);
        }
    }
    searchableView() {
        return this.searchableViewInternal;
    }
    showProfile(profile) {
        return this.parentDataDisplayDelegate.showProfile(profile);
    }
    showObject(snapshotObjectId, perspectiveName) {
        if (Number(snapshotObjectId) <= this.profile.maxJSObjectId) {
            void this.selectLiveObject(perspectiveName, snapshotObjectId);
        }
        else {
            this.parentDataDisplayDelegate.showObject(snapshotObjectId, perspectiveName);
        }
    }
    async linkifyObject(nodeIndex) {
        const heapProfilerModel = this.profile.heapProfilerModel();
        // heapProfilerModel is null if snapshot was loaded from file
        if (!heapProfilerModel) {
            return null;
        }
        const location = await this.profile.getLocation(nodeIndex);
        if (!location) {
            return null;
        }
        const debuggerModel = heapProfilerModel.runtimeModel().debuggerModel();
        const rawLocation = debuggerModel.createRawLocationByScriptId(String(location.scriptId), location.lineNumber, location.columnNumber);
        if (!rawLocation) {
            return null;
        }
        const script = rawLocation.script();
        const sourceURL = script && script.sourceURL;
        return sourceURL && this.linkifier ? this.linkifier.linkifyRawLocation(rawLocation, sourceURL) : null;
    }
    async populate() {
        const heapSnapshotProxy = await this.profile.loadPromise;
        void this.retrieveStatistics(heapSnapshotProxy);
        if (this.dataGrid) {
            void this.dataGrid.setDataSource(heapSnapshotProxy, 0);
        }
        if (this.profile.profileType().id === TrackingHeapSnapshotProfileType.TypeId && this.profile.fromFile()) {
            const samples = await heapSnapshotProxy.getSamples();
            if (samples) {
                console.assert(Boolean(samples.timestamps.length));
                const profileSamples = new Samples();
                profileSamples.sizes = samples.sizes;
                profileSamples.ids = samples.lastAssignedIds;
                profileSamples.timestamps = samples.timestamps;
                profileSamples.max = samples.sizes;
                profileSamples.totalTime = Math.max(samples.timestamps[samples.timestamps.length - 1] || 0, 10000);
                if (this.trackingOverviewGrid) {
                    this.trackingOverviewGrid.setSamples(profileSamples);
                }
            }
        }
        const list = this.profiles();
        const profileIndex = list.indexOf(this.profile);
        this.baseSelect.setSelectedIndex(Math.max(0, profileIndex - 1));
        if (this.trackingOverviewGrid) {
            this.trackingOverviewGrid.updateGrid();
        }
    }
    async retrieveStatistics(heapSnapshotProxy) {
        const statistics = await heapSnapshotProxy.getStatistics();
        const records = [
            { value: statistics.code, color: '#f77', title: i18nString(UIStrings.code) },
            { value: statistics.strings, color: '#5e5', title: i18nString(UIStrings.strings) },
            { value: statistics.jsArrays, color: '#7af', title: i18nString(UIStrings.jsArrays) },
            { value: statistics.native, color: '#fc5', title: i18nString(UIStrings.typedArrays) },
            { value: statistics.system, color: '#98f', title: i18nString(UIStrings.systemObjects) },
        ];
        this.statisticsView.setTotalAndRecords(statistics.total, records);
        return statistics;
    }
    onIdsRangeChanged(event) {
        const { minId, maxId } = event.data;
        this.selectedSizeText.setText(i18nString(UIStrings.selectedSizeS, { PH1: Platform.NumberUtilities.bytesToString(event.data.size) }));
        if (this.constructorsDataGrid.snapshot) {
            this.constructorsDataGrid.setSelectionRange(minId, maxId);
        }
    }
    async toolbarItems() {
        const result = [this.perspectiveSelect, this.classNameFilter];
        if (this.profile.profileType() !== instance.trackingHeapSnapshotProfileType) {
            result.push(this.baseSelect, this.filterSelect);
        }
        result.push(this.selectedSizeText);
        return result;
    }
    willHide() {
        this.currentSearchResultIndex = -1;
        this.popoverHelper.hidePopover();
    }
    supportsCaseSensitiveSearch() {
        return true;
    }
    supportsRegexSearch() {
        return false;
    }
    searchCanceled() {
        this.currentSearchResultIndex = -1;
        this.searchResults = [];
    }
    selectRevealedNode(node) {
        if (node) {
            node.select();
        }
    }
    performSearch(searchConfig, shouldJump, jumpBackwards) {
        const nextQuery = new HeapSnapshotModel.HeapSnapshotModel.SearchConfig(searchConfig.query.trim(), searchConfig.caseSensitive, searchConfig.isRegex, shouldJump, jumpBackwards || false);
        void this.searchThrottler.schedule(this.performSearchInternal.bind(this, nextQuery));
    }
    async performSearchInternal(nextQuery) {
        // Call searchCanceled since it will reset everything we need before doing a new search.
        this.searchCanceled();
        if (!this.currentPerspective.supportsSearch()) {
            return;
        }
        this.currentQuery = nextQuery;
        const query = nextQuery.query.trim();
        if (!query) {
            return;
        }
        if (query.charAt(0) === '@') {
            const snapshotNodeId = parseInt(query.substring(1), 10);
            if (isNaN(snapshotNodeId)) {
                return;
            }
            if (!this.dataGrid) {
                return;
            }
            const node = await this.dataGrid.revealObjectByHeapSnapshotId(String(snapshotNodeId));
            this.selectRevealedNode(node);
            return;
        }
        if (!this.profile.snapshotProxy || !this.dataGrid) {
            return;
        }
        const filter = this.dataGrid.nodeFilter();
        this.searchResults = filter ? await this.profile.snapshotProxy.search(this.currentQuery, filter) : [];
        this.searchableViewInternal.updateSearchMatchesCount(this.searchResults.length);
        if (this.searchResults.length) {
            this.currentSearchResultIndex = nextQuery.jumpBackward ? this.searchResults.length - 1 : 0;
        }
        await this.jumpToSearchResult(this.currentSearchResultIndex);
    }
    jumpToNextSearchResult() {
        if (!this.searchResults.length) {
            return;
        }
        this.currentSearchResultIndex = (this.currentSearchResultIndex + 1) % this.searchResults.length;
        void this.searchThrottler.schedule(this.jumpToSearchResult.bind(this, this.currentSearchResultIndex));
    }
    jumpToPreviousSearchResult() {
        if (!this.searchResults.length) {
            return;
        }
        this.currentSearchResultIndex =
            (this.currentSearchResultIndex + this.searchResults.length - 1) % this.searchResults.length;
        void this.searchThrottler.schedule(this.jumpToSearchResult.bind(this, this.currentSearchResultIndex));
    }
    async jumpToSearchResult(searchResultIndex) {
        this.searchableViewInternal.updateCurrentMatchIndex(searchResultIndex);
        if (searchResultIndex === -1) {
            return;
        }
        if (!this.dataGrid) {
            return;
        }
        const node = await this.dataGrid.revealObjectByHeapSnapshotId(String(this.searchResults[searchResultIndex]));
        this.selectRevealedNode(node);
    }
    refreshVisibleData() {
        if (!this.dataGrid) {
            return;
        }
        let child = this.dataGrid.rootNode().children[0];
        while (child) {
            child.refresh();
            child = child.traverseNextNode(false, null, true);
        }
    }
    changeBase() {
        if (this.baseProfile === this.profiles()[this.baseSelect.selectedIndex()]) {
            return;
        }
        this.baseProfile = this.profiles()[this.baseSelect.selectedIndex()];
        const dataGrid = this.dataGrid;
        // Change set base data source only if main data source is already set.
        if (dataGrid.snapshot) {
            void this.baseProfile.loadPromise.then(dataGrid.setBaseDataSource.bind(dataGrid));
        }
        if (!this.currentQuery || !this.searchResults) {
            return;
        }
        // The current search needs to be performed again. First negate out previous match
        // count by calling the search finished callback with a negative number of matches.
        // Then perform the search again with the same query and callback.
        this.performSearch(this.currentQuery, false);
    }
    changeFilter() {
        const profileIndex = this.filterSelect.selectedIndex() - 1;
        if (!this.dataGrid) {
            return;
        }
        this.dataGrid
            .filterSelectIndexChanged(this.profiles(), profileIndex);
        if (!this.currentQuery || !this.searchResults) {
            return;
        }
        // The current search needs to be performed again. First negate out previous match
        // count by calling the search finished callback with a negative number of matches.
        // Then perform the search again with the same query and callback.
        this.performSearch(this.currentQuery, false);
    }
    profiles() {
        return this.profile.profileType().getProfiles();
    }
    selectionChanged(event) {
        const selectedNode = event.data;
        this.setSelectedNodeForDetailsView(selectedNode);
        this.inspectedObjectChanged(event);
    }
    onSelectAllocationNode(event) {
        const selectedNode = event.data;
        this.constructorsDataGrid.setAllocationNodeId(selectedNode.allocationNodeId());
        this.setSelectedNodeForDetailsView(null);
    }
    inspectedObjectChanged(event) {
        const selectedNode = event.data;
        const heapProfilerModel = this.profile.heapProfilerModel();
        if (heapProfilerModel && selectedNode instanceof HeapSnapshotGenericObjectNode) {
            void heapProfilerModel.addInspectedHeapObject(String(selectedNode.snapshotNodeId));
        }
    }
    setSelectedNodeForDetailsView(nodeItem) {
        const dataSource = nodeItem && nodeItem.retainersDataSource();
        if (dataSource) {
            void this.retainmentDataGrid.setDataSource(dataSource.snapshot, dataSource.snapshotNodeIndex);
            if (this.allocationStackView) {
                void this.allocationStackView.setAllocatedObject(dataSource.snapshot, dataSource.snapshotNodeIndex);
            }
        }
        else {
            if (this.allocationStackView) {
                this.allocationStackView.clear();
            }
            this.retainmentDataGrid.reset();
        }
    }
    async changePerspectiveAndWait(perspectiveTitle) {
        const perspectiveIndex = this.perspectives.findIndex(perspective => perspective.title() === perspectiveTitle);
        if (perspectiveIndex === -1 || this.currentPerspectiveIndex === perspectiveIndex) {
            return;
        }
        const dataGrid = this.perspectives[perspectiveIndex].masterGrid(this);
        if (!dataGrid) {
            return;
        }
        const promise = dataGrid.once(HeapSnapshotSortableDataGridEvents.ContentShown);
        const option = this.perspectiveSelect.options().find(option => option.value === String(perspectiveIndex));
        this.perspectiveSelect.select(option);
        this.changePerspective(perspectiveIndex);
        await promise;
    }
    async updateDataSourceAndView() {
        const dataGrid = this.dataGrid;
        if (!dataGrid || dataGrid.snapshot) {
            return;
        }
        const snapshotProxy = await this.profile.loadPromise;
        if (this.dataGrid !== dataGrid) {
            return;
        }
        if (dataGrid.snapshot !== snapshotProxy) {
            void dataGrid.setDataSource(snapshotProxy, 0);
        }
        if (dataGrid !== this.diffDataGrid) {
            return;
        }
        if (!this.baseProfile) {
            this.baseProfile = this.profiles()[this.baseSelect.selectedIndex()];
        }
        const baseSnapshotProxy = await this.baseProfile.loadPromise;
        if (this.diffDataGrid.baseSnapshot !== baseSnapshotProxy) {
            this.diffDataGrid.setBaseDataSource(baseSnapshotProxy);
        }
    }
    onSelectedPerspectiveChanged(event) {
        this.changePerspective(Number(event.target.selectedOptions[0].value));
    }
    changePerspective(selectedIndex) {
        if (selectedIndex === this.currentPerspectiveIndex) {
            return;
        }
        this.currentPerspectiveIndex = selectedIndex;
        this.currentPerspective.deactivate(this);
        const perspective = this.perspectives[selectedIndex];
        this.currentPerspective = perspective;
        this.dataGrid = perspective.masterGrid(this);
        perspective.activate(this);
        this.refreshVisibleData();
        if (this.dataGrid) {
            this.dataGrid.updateWidths();
        }
        void this.updateDataSourceAndView();
        if (!this.currentQuery || !this.searchResults) {
            return;
        }
        // The current search needs to be performed again. First negate out previous match
        // count by calling the search finished callback with a negative number of matches.
        // Then perform the search again the with same query and callback.
        this.performSearch(this.currentQuery, false);
    }
    async selectLiveObject(perspectiveName, snapshotObjectId) {
        await this.changePerspectiveAndWait(perspectiveName);
        if (!this.dataGrid) {
            return;
        }
        const node = await this.dataGrid.revealObjectByHeapSnapshotId(snapshotObjectId);
        if (node) {
            node.select();
        }
        else {
            Common.Console.Console.instance().error('Cannot find corresponding heap snapshot node');
        }
    }
    getPopoverRequest(event) {
        const span = UI.UIUtils.enclosingNodeOrSelfWithNodeName(event.target, 'span');
        const row = UI.UIUtils.enclosingNodeOrSelfWithNodeName(event.target, 'tr');
        if (!row) {
            return null;
        }
        if (!this.dataGrid) {
            return null;
        }
        const node = this.dataGrid.dataGridNodeFromNode(row) || this.containmentDataGrid.dataGridNodeFromNode(row) ||
            this.constructorsDataGrid.dataGridNodeFromNode(row) || this.diffDataGrid.dataGridNodeFromNode(row) ||
            (this.allocationDataGrid && this.allocationDataGrid.dataGridNodeFromNode(row)) ||
            this.retainmentDataGrid.dataGridNodeFromNode(row);
        const heapProfilerModel = this.profile.heapProfilerModel();
        if (!node || !span || !heapProfilerModel) {
            return null;
        }
        let objectPopoverHelper;
        return {
            // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
            // @ts-expect-error
            box: span.boxInWindow(),
            show: async (popover) => {
                if (!heapProfilerModel) {
                    return false;
                }
                const remoteObject = await node.queryObjectContent(heapProfilerModel, 'popover');
                if (!remoteObject) {
                    return false;
                }
                objectPopoverHelper =
                    await ObjectUI.ObjectPopoverHelper.ObjectPopoverHelper.buildObjectPopover(remoteObject, popover);
                if (!objectPopoverHelper) {
                    heapProfilerModel.runtimeModel().releaseObjectGroup('popover');
                    return false;
                }
                return true;
            },
            hide: () => {
                heapProfilerModel.runtimeModel().releaseObjectGroup('popover');
                if (objectPopoverHelper) {
                    objectPopoverHelper.dispose();
                }
            },
        };
    }
    updatePerspectiveOptions() {
        const multipleSnapshots = this.profiles().length > 1;
        this.perspectiveSelect.removeOptions();
        this.perspectives.forEach((perspective, index) => {
            if (multipleSnapshots || perspective !== this.comparisonPerspective) {
                this.perspectiveSelect.createOption(perspective.title(), String(index));
            }
        });
    }
    updateBaseOptions() {
        const list = this.profiles();
        const selectedIndex = this.baseSelect.selectedIndex();
        this.baseSelect.removeOptions();
        for (const item of list) {
            this.baseSelect.createOption(item.title);
        }
        if (selectedIndex > -1) {
            this.baseSelect.setSelectedIndex(selectedIndex);
        }
    }
    updateFilterOptions() {
        const list = this.profiles();
        const selectedIndex = this.filterSelect.selectedIndex();
        this.filterSelect.removeOptions();
        this.filterSelect.createOption(i18nString(UIStrings.allObjects));
        for (let i = 0; i < list.length; ++i) {
            let title;
            if (!i) {
                title = i18nString(UIStrings.objectsAllocatedBeforeS, { PH1: list[i].title });
            }
            else {
                title = i18nString(UIStrings.objectsAllocatedBetweenSAndS, { PH1: list[i - 1].title, PH2: list[i].title });
            }
            this.filterSelect.createOption(title);
        }
        if (selectedIndex > -1) {
            this.filterSelect.setSelectedIndex(selectedIndex);
        }
    }
    updateControls() {
        this.updatePerspectiveOptions();
        this.updateBaseOptions();
        this.updateFilterOptions();
    }
    onReceiveSnapshot(event) {
        this.updateControls();
        const profile = event.data;
        profile.addEventListener(ProfileHeaderEvents.ProfileTitleChanged, this.updateControls, this);
    }
    onProfileHeaderRemoved(event) {
        const profile = event.data;
        profile.removeEventListener(ProfileHeaderEvents.ProfileTitleChanged, this.updateControls, this);
        if (this.profile === profile) {
            this.detach();
            this.profile.profileType().removeEventListener("SnapshotReceived" /* SnapshotReceived */, this.onReceiveSnapshot, this);
            this.profile.profileType().removeEventListener(ProfileTypeEvents.RemoveProfileHeader, this.onProfileHeaderRemoved, this);
            this.dispose();
        }
        else {
            this.updateControls();
        }
    }
    dispose() {
        this.linkifier.dispose();
        this.popoverHelper.dispose();
        if (this.allocationStackView) {
            this.allocationStackView.clear();
            if (this.allocationDataGrid) {
                this.allocationDataGrid.dispose();
            }
        }
        this.onStopTracking();
        if (this.trackingOverviewGrid) {
            this.trackingOverviewGrid.removeEventListener("IdsRangeChanged" /* IdsRangeChanged */, this.onIdsRangeChanged.bind(this));
        }
    }
}
export class Perspective {
    titleInternal;
    constructor(title) {
        this.titleInternal = title;
    }
    activate(_heapSnapshotView) {
    }
    deactivate(heapSnapshotView) {
        heapSnapshotView.baseSelect.setVisible(false);
        heapSnapshotView.filterSelect.setVisible(false);
        heapSnapshotView.classNameFilter.setVisible(false);
        if (heapSnapshotView.trackingOverviewGrid) {
            heapSnapshotView.trackingOverviewGrid.detach();
        }
        if (heapSnapshotView.allocationWidget) {
            heapSnapshotView.allocationWidget.detach();
        }
        if (heapSnapshotView.statisticsView) {
            heapSnapshotView.statisticsView.detach();
        }
        heapSnapshotView.splitWidget.detach();
        heapSnapshotView.splitWidget.detachChildWidgets();
    }
    masterGrid(_heapSnapshotView) {
        return null;
    }
    title() {
        return this.titleInternal;
    }
    supportsSearch() {
        return false;
    }
}
export class SummaryPerspective extends Perspective {
    constructor() {
        super(i18nString(UIStrings.summary));
    }
    activate(heapSnapshotView) {
        heapSnapshotView.splitWidget.setMainWidget(heapSnapshotView.constructorsWidget);
        heapSnapshotView.splitWidget.setSidebarWidget(heapSnapshotView.objectDetailsView);
        heapSnapshotView.splitWidget.show(heapSnapshotView.searchableViewInternal.element);
        heapSnapshotView.filterSelect.setVisible(true);
        heapSnapshotView.classNameFilter.setVisible(true);
        if (!heapSnapshotView.trackingOverviewGrid) {
            return;
        }
        heapSnapshotView.trackingOverviewGrid.show(heapSnapshotView.searchableViewInternal.element, heapSnapshotView.splitWidget.element);
        heapSnapshotView.trackingOverviewGrid.update();
        heapSnapshotView.trackingOverviewGrid.updateGrid();
    }
    masterGrid(heapSnapshotView) {
        return heapSnapshotView.constructorsDataGrid;
    }
    supportsSearch() {
        return true;
    }
}
export class ComparisonPerspective extends Perspective {
    constructor() {
        super(i18nString(UIStrings.comparison));
    }
    activate(heapSnapshotView) {
        heapSnapshotView.splitWidget.setMainWidget(heapSnapshotView.diffWidget);
        heapSnapshotView.splitWidget.setSidebarWidget(heapSnapshotView.objectDetailsView);
        heapSnapshotView.splitWidget.show(heapSnapshotView.searchableViewInternal.element);
        heapSnapshotView.baseSelect.setVisible(true);
        heapSnapshotView.classNameFilter.setVisible(true);
    }
    masterGrid(heapSnapshotView) {
        return heapSnapshotView.diffDataGrid;
    }
    supportsSearch() {
        return true;
    }
}
export class ContainmentPerspective extends Perspective {
    constructor() {
        super(i18nString(UIStrings.containment));
    }
    activate(heapSnapshotView) {
        heapSnapshotView.splitWidget.setMainWidget(heapSnapshotView.containmentWidget);
        heapSnapshotView.splitWidget.setSidebarWidget(heapSnapshotView.objectDetailsView);
        heapSnapshotView.splitWidget.show(heapSnapshotView.searchableViewInternal.element);
    }
    masterGrid(heapSnapshotView) {
        return heapSnapshotView.containmentDataGrid;
    }
}
export class AllocationPerspective extends Perspective {
    allocationSplitWidget;
    constructor() {
        super(i18nString(UIStrings.allocation));
        this.allocationSplitWidget =
            new UI.SplitWidget.SplitWidget(false, true, 'heapSnapshotAllocationSplitViewState', 200, 200);
        this.allocationSplitWidget.setSidebarWidget(new UI.Widget.VBox());
    }
    activate(heapSnapshotView) {
        if (heapSnapshotView.allocationWidget) {
            this.allocationSplitWidget.setMainWidget(heapSnapshotView.allocationWidget);
        }
        heapSnapshotView.splitWidget.setMainWidget(heapSnapshotView.constructorsWidget);
        heapSnapshotView.splitWidget.setSidebarWidget(heapSnapshotView.objectDetailsView);
        const allocatedObjectsView = new UI.Widget.VBox();
        const resizer = document.createElement('div');
        resizer.classList.add('heap-snapshot-view-resizer');
        const title = resizer.createChild('div', 'title').createChild('span');
        resizer.createChild('div', 'verticalResizerIcon');
        title.textContent = i18nString(UIStrings.liveObjects);
        this.allocationSplitWidget.hideDefaultResizer();
        this.allocationSplitWidget.installResizer(resizer);
        allocatedObjectsView.element.appendChild(resizer);
        heapSnapshotView.splitWidget.show(allocatedObjectsView.element);
        this.allocationSplitWidget.setSidebarWidget(allocatedObjectsView);
        this.allocationSplitWidget.show(heapSnapshotView.searchableViewInternal.element);
        heapSnapshotView.constructorsDataGrid.clear();
        if (heapSnapshotView.allocationDataGrid) {
            const selectedNode = heapSnapshotView.allocationDataGrid.selectedNode;
            if (selectedNode) {
                heapSnapshotView.constructorsDataGrid.setAllocationNodeId(selectedNode.allocationNodeId());
            }
        }
    }
    deactivate(heapSnapshotView) {
        this.allocationSplitWidget.detach();
        super.deactivate(heapSnapshotView);
    }
    masterGrid(heapSnapshotView) {
        return heapSnapshotView.allocationDataGrid;
    }
}
export class StatisticsPerspective extends Perspective {
    constructor() {
        super(i18nString(UIStrings.statistics));
    }
    activate(heapSnapshotView) {
        heapSnapshotView.statisticsView.show(heapSnapshotView.searchableViewInternal.element);
    }
    masterGrid(_heapSnapshotView) {
        return null;
    }
}
export class HeapSnapshotProfileType extends Common.ObjectWrapper.eventMixin(ProfileType) {
    exposeInternals;
    captureNumericValue;
    customContentInternal;
    constructor(id, title) {
        super(id || HeapSnapshotProfileType.TypeId, title || i18nString(UIStrings.heapSnapshot));
        SDK.TargetManager.TargetManager.instance().observeModels(SDK.HeapProfilerModel.HeapProfilerModel, this);
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.HeapProfilerModel.HeapProfilerModel, SDK.HeapProfilerModel.Events.ResetProfiles, this.resetProfiles, this);
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.HeapProfilerModel.HeapProfilerModel, SDK.HeapProfilerModel.Events.AddHeapSnapshotChunk, this.addHeapSnapshotChunk, this);
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.HeapProfilerModel.HeapProfilerModel, SDK.HeapProfilerModel.Events.ReportHeapSnapshotProgress, this.reportHeapSnapshotProgress, this);
        this.exposeInternals = Common.Settings.Settings.instance().createSetting('exposeInternals', false);
        this.captureNumericValue = Common.Settings.Settings.instance().createSetting('captureNumericValue', false);
        this.customContentInternal = null;
    }
    modelAdded(heapProfilerModel) {
        void heapProfilerModel.enable();
    }
    modelRemoved(_heapProfilerModel) {
    }
    getProfiles() {
        return super.getProfiles();
    }
    fileExtension() {
        return '.heapsnapshot';
    }
    get buttonTooltip() {
        return i18nString(UIStrings.takeHeapSnapshot);
    }
    isInstantProfile() {
        return true;
    }
    buttonClicked() {
        void this.takeHeapSnapshot();
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.ProfilesHeapProfileTaken);
        return false;
    }
    get treeItemTitle() {
        return i18nString(UIStrings.heapSnapshots);
    }
    get description() {
        return i18nString(UIStrings.heapSnapshotProfilesShowMemory);
    }
    customContent() {
        const optionsContainer = document.createElement('div');
        const showOptionToExposeInternalsInHeapSnapshot = Root.Runtime.experiments.isEnabled('showOptionToExposeInternalsInHeapSnapshot');
        const omitParagraphElement = !showOptionToExposeInternalsInHeapSnapshot;
        if (showOptionToExposeInternalsInHeapSnapshot) {
            const exposeInternalsInHeapSnapshotCheckbox = UI.SettingsUI.createSettingCheckbox(i18nString(UIStrings.exposeInternals), this.exposeInternals, omitParagraphElement);
            optionsContainer.appendChild(exposeInternalsInHeapSnapshotCheckbox);
        }
        const captureNumericValueCheckbox = UI.SettingsUI.createSettingCheckbox(UIStrings.captureNumericValue, this.captureNumericValue, omitParagraphElement);
        optionsContainer.appendChild(captureNumericValueCheckbox);
        this.customContentInternal = optionsContainer;
        return optionsContainer;
    }
    setCustomContentEnabled(enable) {
        if (this.customContentInternal) {
            this.customContentInternal.querySelectorAll('[is=dt-checkbox]').forEach(label => {
                label.checkboxElement.disabled = !enable;
            });
        }
    }
    createProfileLoadedFromFile(title) {
        return new HeapProfileHeader(null, this, title);
    }
    async takeHeapSnapshot() {
        if (this.profileBeingRecorded()) {
            return;
        }
        const heapProfilerModel = UI.Context.Context.instance().flavor(SDK.HeapProfilerModel.HeapProfilerModel);
        if (!heapProfilerModel) {
            return;
        }
        let profile = new HeapProfileHeader(heapProfilerModel, this);
        this.setProfileBeingRecorded(profile);
        this.addProfile(profile);
        profile.updateStatus(i18nString(UIStrings.snapshotting));
        await heapProfilerModel.takeHeapSnapshot({
            reportProgress: true,
            captureNumericValue: this.captureNumericValue.get(),
            exposeInternals: this.exposeInternals.get(),
        });
        profile = this.profileBeingRecorded();
        if (!profile) {
            return;
        }
        profile.title = i18nString(UIStrings.snapshotD, { PH1: profile.uid });
        profile.finishLoad();
        this.setProfileBeingRecorded(null);
        this.dispatchEventToListeners(ProfileTypeEvents.ProfileComplete, profile);
    }
    addHeapSnapshotChunk(event) {
        const profile = this.profileBeingRecorded();
        if (!profile) {
            return;
        }
        profile.transferChunk(event.data);
    }
    reportHeapSnapshotProgress(event) {
        const profile = this.profileBeingRecorded();
        if (!profile) {
            return;
        }
        const { done, total, finished } = event.data;
        profile.updateStatus(i18nString(UIStrings.percentagePlaceholder, { PH1: ((done / total) * 100).toFixed(0) }), true);
        if (finished) {
            profile.prepareToLoad();
        }
    }
    resetProfiles(event) {
        const heapProfilerModel = event.data;
        for (const profile of this.getProfiles()) {
            if (profile.heapProfilerModel() === heapProfilerModel) {
                this.removeProfile(profile);
            }
        }
    }
    snapshotReceived(profile) {
        if (this.profileBeingRecorded() === profile) {
            this.setProfileBeingRecorded(null);
        }
        this.dispatchEventToListeners("SnapshotReceived" /* SnapshotReceived */, profile);
    }
    // eslint-disable-next-line @typescript-eslint/naming-convention
    static TypeId = 'HEAP';
    // TODO(crbug.com/1228674): Remove event string once its no longer used in web tests.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    static SnapshotReceived = 'SnapshotReceived';
}
export class TrackingHeapSnapshotProfileType extends Common.ObjectWrapper.eventMixin(HeapSnapshotProfileType) {
    recordAllocationStacksSettingInternal;
    customContentInternal;
    recording;
    profileSamples;
    constructor() {
        super(TrackingHeapSnapshotProfileType.TypeId, i18nString(UIStrings.allocationInstrumentationOn));
        this.recordAllocationStacksSettingInternal =
            Common.Settings.Settings.instance().createSetting('recordAllocationStacks', false);
        this.customContentInternal = null;
        this.recording = false;
    }
    modelAdded(heapProfilerModel) {
        super.modelAdded(heapProfilerModel);
        heapProfilerModel.addEventListener(SDK.HeapProfilerModel.Events.HeapStatsUpdate, this.heapStatsUpdate, this);
        heapProfilerModel.addEventListener(SDK.HeapProfilerModel.Events.LastSeenObjectId, this.lastSeenObjectId, this);
    }
    modelRemoved(heapProfilerModel) {
        super.modelRemoved(heapProfilerModel);
        heapProfilerModel.removeEventListener(SDK.HeapProfilerModel.Events.HeapStatsUpdate, this.heapStatsUpdate, this);
        heapProfilerModel.removeEventListener(SDK.HeapProfilerModel.Events.LastSeenObjectId, this.lastSeenObjectId, this);
    }
    heapStatsUpdate(event) {
        if (!this.profileSamples) {
            return;
        }
        const samples = event.data;
        let index;
        for (let i = 0; i < samples.length; i += 3) {
            index = samples[i];
            const size = samples[i + 2];
            this.profileSamples.sizes[index] = size;
            if (!this.profileSamples.max[index]) {
                this.profileSamples.max[index] = size;
            }
        }
    }
    lastSeenObjectId(event) {
        const profileSamples = this.profileSamples;
        if (!profileSamples) {
            return;
        }
        const { lastSeenObjectId, timestamp } = event.data;
        const currentIndex = Math.max(profileSamples.ids.length, profileSamples.max.length - 1);
        profileSamples.ids[currentIndex] = lastSeenObjectId;
        if (!profileSamples.max[currentIndex]) {
            profileSamples.max[currentIndex] = 0;
            profileSamples.sizes[currentIndex] = 0;
        }
        profileSamples.timestamps[currentIndex] = timestamp;
        if (profileSamples.totalTime < timestamp - profileSamples.timestamps[0]) {
            profileSamples.totalTime *= 2;
        }
        if (this.profileSamples) {
            this.dispatchEventToListeners("HeapStatsUpdate" /* HeapStatsUpdate */, this.profileSamples);
        }
        const profile = this.profileBeingRecorded();
        if (profile) {
            profile.updateStatus(null, true);
        }
    }
    hasTemporaryView() {
        return true;
    }
    get buttonTooltip() {
        return this.recording ? i18nString(UIStrings.stopRecordingHeapProfile) :
            i18nString(UIStrings.startRecordingHeapProfile);
    }
    isInstantProfile() {
        return false;
    }
    buttonClicked() {
        return this.toggleRecording();
    }
    startRecordingProfile() {
        if (this.profileBeingRecorded()) {
            return;
        }
        const heapProfilerModel = this.addNewProfile();
        if (!heapProfilerModel) {
            return;
        }
        void heapProfilerModel.startTrackingHeapObjects(this.recordAllocationStacksSettingInternal.get());
    }
    customContent() {
        const checkboxSetting = UI.SettingsUI.createSettingCheckbox(i18nString(UIStrings.recordAllocationStacksExtra), this.recordAllocationStacksSettingInternal, true);
        this.customContentInternal = checkboxSetting;
        return checkboxSetting;
    }
    setCustomContentEnabled(enable) {
        if (this.customContentInternal) {
            this.customContentInternal.checkboxElement.disabled = !enable;
        }
    }
    recordAllocationStacksSetting() {
        return this.recordAllocationStacksSettingInternal;
    }
    addNewProfile() {
        const heapProfilerModel = UI.Context.Context.instance().flavor(SDK.HeapProfilerModel.HeapProfilerModel);
        if (!heapProfilerModel) {
            return null;
        }
        this.setProfileBeingRecorded(new HeapProfileHeader(heapProfilerModel, this, undefined));
        this.profileSamples = new Samples();
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.profileBeingRecorded()._profileSamples = this.profileSamples;
        this.recording = true;
        this.addProfile(this.profileBeingRecorded());
        this.profileBeingRecorded().updateStatus(i18nString(UIStrings.recording));
        this.dispatchEventToListeners("TrackingStarted" /* TrackingStarted */);
        return heapProfilerModel;
    }
    async stopRecordingProfile() {
        let profile = this.profileBeingRecorded();
        profile.updateStatus(i18nString(UIStrings.snapshotting));
        const stopPromise = profile.heapProfilerModel().stopTrackingHeapObjects(true);
        this.recording = false;
        this.dispatchEventToListeners("TrackingStopped" /* TrackingStopped */);
        await stopPromise;
        profile = this.profileBeingRecorded();
        if (!profile) {
            return;
        }
        profile.finishLoad();
        this.profileSamples = null;
        this.setProfileBeingRecorded(null);
        this.dispatchEventToListeners(ProfileTypeEvents.ProfileComplete, profile);
    }
    toggleRecording() {
        if (this.recording) {
            void this.stopRecordingProfile();
        }
        else {
            this.startRecordingProfile();
        }
        return this.recording;
    }
    fileExtension() {
        return '.heaptimeline';
    }
    get treeItemTitle() {
        return i18nString(UIStrings.allocationTimelines);
    }
    get description() {
        return i18nString(UIStrings.AllocationTimelinesShowInstrumented);
    }
    resetProfiles(event) {
        const wasRecording = this.recording;
        // Clear current profile to avoid stopping backend.
        this.setProfileBeingRecorded(null);
        super.resetProfiles(event);
        this.profileSamples = null;
        if (wasRecording) {
            this.addNewProfile();
        }
    }
    profileBeingRecordedRemoved() {
        void this.stopRecordingProfile();
        this.profileSamples = null;
    }
    // eslint-disable-next-line @typescript-eslint/naming-convention
    static TypeId = 'HEAP-RECORD';
    // TODO(crbug.com/1228674): Remove event strings once they are no longer used in web tests.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    static HeapStatsUpdate = 'HeapStatsUpdate';
    // eslint-disable-next-line @typescript-eslint/naming-convention
    static TrackingStarted = 'TrackingStarted';
    // eslint-disable-next-line @typescript-eslint/naming-convention
    static TrackingStopped = 'TrackingStopped';
}
export class HeapProfileHeader extends ProfileHeader {
    heapProfilerModelInternal;
    maxJSObjectId;
    workerProxy;
    receiver;
    snapshotProxy;
    loadPromise;
    fulfillLoad;
    totalNumberOfChunks;
    bufferedWriter;
    onTempFileReady;
    failedToCreateTempFile;
    wasDisposed;
    fileName;
    constructor(heapProfilerModel, type, title) {
        super(type, title || i18nString(UIStrings.snapshotD, { PH1: type.nextProfileUid() }));
        this.heapProfilerModelInternal = heapProfilerModel;
        this.maxJSObjectId = -1;
        this.workerProxy = null;
        this.receiver = null;
        this.snapshotProxy = null;
        this.loadPromise = new Promise(resolve => {
            this.fulfillLoad = resolve;
        });
        this.totalNumberOfChunks = 0;
        this.bufferedWriter = null;
        this.onTempFileReady = null;
    }
    heapProfilerModel() {
        return this.heapProfilerModelInternal;
    }
    async getLocation(nodeIndex) {
        if (!this.snapshotProxy) {
            return null;
        }
        return this.snapshotProxy.getLocation(nodeIndex);
    }
    createSidebarTreeElement(dataDisplayDelegate) {
        return new ProfileSidebarTreeElement(dataDisplayDelegate, this, 'heap-snapshot-sidebar-tree-item');
    }
    createView(dataDisplayDelegate) {
        return new HeapSnapshotView(dataDisplayDelegate, this);
    }
    prepareToLoad() {
        console.assert(!this.receiver, 'Already loading');
        this.setupWorker();
        this.updateStatus(i18nString(UIStrings.loading), true);
    }
    finishLoad() {
        if (!this.wasDisposed && this.receiver) {
            void this.receiver.close();
        }
        if (!this.bufferedWriter) {
            return;
        }
        this.didWriteToTempFile(this.bufferedWriter);
    }
    didWriteToTempFile(tempFile) {
        if (this.wasDisposed) {
            if (tempFile) {
                tempFile.remove();
            }
            return;
        }
        this.tempFile = tempFile;
        if (!tempFile) {
            this.failedToCreateTempFile = true;
        }
        if (this.onTempFileReady) {
            this.onTempFileReady();
            this.onTempFileReady = null;
        }
    }
    setupWorker() {
        console.assert(!this.workerProxy, 'HeapSnapshotWorkerProxy already exists');
        this.workerProxy = new HeapSnapshotWorkerProxy(this.handleWorkerEvent.bind(this));
        this.workerProxy.addEventListener("Wait" /* Wait */, event => {
            this.updateStatus(null, event.data);
        }, this);
        this.receiver = this.workerProxy.createLoader(this.uid, this.snapshotReceived.bind(this));
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handleWorkerEvent(eventName, data) {
        if (HeapSnapshotModel.HeapSnapshotModel.HeapSnapshotProgressEvent.BrokenSnapshot === eventName) {
            const error = data;
            Common.Console.Console.instance().error(error);
            return;
        }
        if (HeapSnapshotModel.HeapSnapshotModel.HeapSnapshotProgressEvent.Update !== eventName) {
            return;
        }
        const serializedMessage = data;
        const messageObject = i18n.i18n.deserializeUIString(serializedMessage);
        // We know all strings from the worker are declared inside a single file so we can
        // use a custom function.
        this.updateStatus(moduleI18nString(messageObject.string, messageObject.values));
    }
    dispose() {
        if (this.workerProxy) {
            this.workerProxy.dispose();
        }
        this.removeTempFile();
        this.wasDisposed = true;
    }
    didCompleteSnapshotTransfer() {
        if (!this.snapshotProxy) {
            return;
        }
        this.updateStatus(Platform.NumberUtilities.bytesToString(this.snapshotProxy.totalSize), false);
    }
    transferChunk(chunk) {
        if (!this.bufferedWriter) {
            this.bufferedWriter = new Bindings.TempFile.TempFile();
        }
        this.bufferedWriter.write([chunk]);
        ++this.totalNumberOfChunks;
        if (this.receiver) {
            void this.receiver.write(chunk);
        }
    }
    snapshotReceived(snapshotProxy) {
        if (this.wasDisposed) {
            return;
        }
        this.receiver = null;
        this.snapshotProxy = snapshotProxy;
        this.maxJSObjectId = snapshotProxy.maxJSObjectId();
        this.didCompleteSnapshotTransfer();
        if (this.workerProxy) {
            this.workerProxy.startCheckingForLongRunningCalls();
        }
        this.notifySnapshotReceived();
    }
    notifySnapshotReceived() {
        if (this.snapshotProxy && this.fulfillLoad) {
            this.fulfillLoad(this.snapshotProxy);
        }
        this.profileType().snapshotReceived(this);
        if (this.canSaveToFile()) {
            this.dispatchEventToListeners(ProfileHeaderEvents.ProfileReceived);
        }
    }
    canSaveToFile() {
        return !this.fromFile() && Boolean(this.snapshotProxy);
    }
    saveToFile() {
        const fileOutputStream = new Bindings.FileUtils.FileOutputStream();
        this.fileName = this.fileName ||
            'Heap-' + Platform.DateUtilities.toISO8601Compact(new Date()) + this.profileType().fileExtension();
        const onOpen = async (accepted) => {
            if (!accepted) {
                return;
            }
            if (this.failedToCreateTempFile) {
                Common.Console.Console.instance().error('Failed to open temp file with heap snapshot');
                void fileOutputStream.close();
                return;
            }
            if (this.tempFile) {
                const error = await this.tempFile.copyToOutputStream(fileOutputStream, this.onChunkTransferred.bind(this));
                if (error) {
                    Common.Console.Console.instance().error('Failed to read heap snapshot from temp file: ' + error.message);
                }
                this.didCompleteSnapshotTransfer();
                return;
            }
            this.onTempFileReady = () => {
                void onOpen(accepted);
            };
            this.updateSaveProgress(0, 1);
        };
        void fileOutputStream.open(this.fileName).then(onOpen.bind(this));
    }
    onChunkTransferred(reader) {
        this.updateSaveProgress(reader.loadedSize(), reader.fileSize());
    }
    updateSaveProgress(value, total) {
        const percentValue = ((total && value / total) * 100).toFixed(0);
        this.updateStatus(i18nString(UIStrings.savingD, { PH1: percentValue }));
    }
    async loadFromFile(file) {
        this.updateStatus(i18nString(UIStrings.loading), true);
        this.setupWorker();
        const reader = new Bindings.FileUtils.ChunkedFileReader(file, 10000000);
        const success = await reader.read(this.receiver);
        if (!success) {
            const error = reader.error();
            if (error) {
                this.updateStatus(error.message);
            }
        }
        return success ? null : reader.error();
    }
    profileType() {
        return super.profileType();
    }
}
export class HeapSnapshotStatisticsView extends UI.Widget.VBox {
    pieChart;
    constructor() {
        super();
        this.element.classList.add('heap-snapshot-statistics-view');
        this.pieChart = new PerfUI.PieChart.PieChart();
        this.setTotalAndRecords(0, []);
        this.pieChart.classList.add('heap-snapshot-stats-pie-chart');
        this.element.appendChild(this.pieChart);
    }
    static valueFormatter(value) {
        return i18nString(UIStrings.sKb, { PH1: Platform.NumberUtilities.withThousandsSeparator(Math.round(value / 1000)) });
    }
    setTotalAndRecords(total, records) {
        this.pieChart.data = {
            chartName: i18nString(UIStrings.heapMemoryUsage),
            size: 150,
            formatter: HeapSnapshotStatisticsView.valueFormatter,
            showLegend: true,
            total,
            slices: records,
        };
    }
}
export class HeapAllocationStackView extends UI.Widget.Widget {
    heapProfilerModel;
    linkifier;
    frameElements;
    constructor(heapProfilerModel) {
        super();
        this.heapProfilerModel = heapProfilerModel;
        this.linkifier = new Components.Linkifier.Linkifier();
        this.frameElements = [];
    }
    onContextMenu(link, event) {
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        if (!contextMenu.containsTarget(link)) {
            contextMenu.appendApplicableItems(link);
        }
        void contextMenu.show();
        event.consume(true);
    }
    onStackViewKeydown(event) {
        const target = event.target;
        if (!target) {
            return;
        }
        if (event.key === 'Enter') {
            const link = stackFrameToURLElement.get(target);
            if (!link) {
                return;
            }
            const linkInfo = Components.Linkifier.Linkifier.linkInfo(link);
            if (!linkInfo) {
                return;
            }
            if (Components.Linkifier.Linkifier.invokeFirstAction(linkInfo)) {
                event.consume(true);
            }
            return;
        }
        let navDown;
        const keyboardEvent = event;
        if (keyboardEvent.key === 'ArrowUp') {
            navDown = false;
        }
        else if (keyboardEvent.key === 'ArrowDown') {
            navDown = true;
        }
        else {
            return;
        }
        const index = this.frameElements.indexOf(target);
        if (index === -1) {
            return;
        }
        const nextIndex = navDown ? index + 1 : index - 1;
        if (nextIndex < 0 || nextIndex >= this.frameElements.length) {
            return;
        }
        const nextFrame = this.frameElements[nextIndex];
        nextFrame.tabIndex = 0;
        target.tabIndex = -1;
        nextFrame.focus();
        event.consume(true);
    }
    async setAllocatedObject(snapshot, snapshotNodeIndex) {
        this.clear();
        const frames = await snapshot.allocationStack(snapshotNodeIndex);
        if (!frames) {
            const stackDiv = this.element.createChild('div', 'no-heap-allocation-stack');
            UI.UIUtils.createTextChild(stackDiv, i18nString(UIStrings.stackWasNotRecordedForThisObject));
            return;
        }
        const stackDiv = this.element.createChild('div', 'heap-allocation-stack');
        stackDiv.addEventListener('keydown', this.onStackViewKeydown.bind(this), false);
        for (const frame of frames) {
            const frameDiv = stackDiv.createChild('div', 'stack-frame');
            this.frameElements.push(frameDiv);
            frameDiv.tabIndex = -1;
            const name = frameDiv.createChild('div');
            name.textContent = UI.UIUtils.beautifyFunctionName(frame.functionName);
            if (!frame.scriptId) {
                continue;
            }
            const target = this.heapProfilerModel ? this.heapProfilerModel.target() : null;
            const options = { columnNumber: frame.column - 1, inlineFrameIndex: 0 };
            const urlElement = this.linkifier.linkifyScriptLocation(target, String(frame.scriptId), frame.scriptName, frame.line - 1, options);
            frameDiv.appendChild(urlElement);
            stackFrameToURLElement.set(frameDiv, urlElement);
            frameDiv.addEventListener('contextmenu', this.onContextMenu.bind(this, urlElement));
        }
        this.frameElements[0].tabIndex = 0;
    }
    clear() {
        this.element.removeChildren();
        this.frameElements = [];
        this.linkifier.reset();
    }
}
const stackFrameToURLElement = new WeakMap();
//# sourceMappingURL=HeapSnapshotView.js.map
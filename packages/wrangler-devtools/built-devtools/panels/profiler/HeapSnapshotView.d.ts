import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Bindings from '../../models/bindings/bindings.js';
import * as HeapSnapshotModel from '../../models/heap_snapshot_model/heap_snapshot_model.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as PerfUI from '../../ui/legacy/components/perf_ui/perf_ui.js';
import * as Components from '../../ui/legacy/components/utils/utils.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { HeapSnapshotSortableDataGrid } from './HeapSnapshotDataGrids.js';
import { AllocationDataGrid, HeapSnapshotConstructorsDataGrid, HeapSnapshotDiffDataGrid, HeapSnapshotRetainmentDataGrid, HeapSnapshotContainmentDataGrid } from './HeapSnapshotDataGrids.js';
import type { HeapSnapshotGridNode } from './HeapSnapshotGridNodes.js';
import type { HeapSnapshotProxy } from './HeapSnapshotProxy.js';
import { HeapSnapshotWorkerProxy } from './HeapSnapshotProxy.js';
import type { IdsRangeChangedEvent } from './HeapTimelineOverview.js';
import { HeapTimelineOverview, Samples } from './HeapTimelineOverview.js';
import type { DataDisplayDelegate } from './ProfileHeader.js';
import { ProfileHeader, ProfileType } from './ProfileHeader.js';
import { ProfileSidebarTreeElement } from './ProfileSidebarTreeElement.js';
export declare class HeapSnapshotView extends UI.View.SimpleView implements DataDisplayDelegate, UI.SearchableView.Searchable {
    searchResults: number[];
    profile: HeapProfileHeader;
    readonly linkifier: Components.Linkifier.Linkifier;
    readonly parentDataDisplayDelegate: DataDisplayDelegate;
    readonly searchableViewInternal: UI.SearchableView.SearchableView;
    readonly splitWidget: UI.SplitWidget.SplitWidget;
    readonly containmentDataGrid: HeapSnapshotContainmentDataGrid;
    readonly containmentWidget: DataGrid.DataGrid.DataGridWidget<HeapSnapshotGridNode>;
    readonly statisticsView: HeapSnapshotStatisticsView;
    readonly constructorsDataGrid: HeapSnapshotConstructorsDataGrid;
    readonly constructorsWidget: DataGrid.DataGrid.DataGridWidget<HeapSnapshotGridNode>;
    readonly diffDataGrid: HeapSnapshotDiffDataGrid;
    readonly diffWidget: DataGrid.DataGrid.DataGridWidget<HeapSnapshotGridNode>;
    readonly allocationDataGrid: AllocationDataGrid | null;
    readonly allocationWidget: DataGrid.DataGrid.DataGridWidget<HeapSnapshotGridNode> | undefined;
    readonly allocationStackView: HeapAllocationStackView | undefined;
    readonly tabbedPane: UI.TabbedPane.TabbedPane | undefined;
    readonly retainmentDataGrid: HeapSnapshotRetainmentDataGrid;
    readonly retainmentWidget: DataGrid.DataGrid.DataGridWidget<HeapSnapshotGridNode>;
    readonly objectDetailsView: UI.Widget.VBox;
    readonly perspectives: (SummaryPerspective | ComparisonPerspective | ContainmentPerspective | AllocationPerspective | StatisticsPerspective)[];
    readonly comparisonPerspective: ComparisonPerspective;
    readonly perspectiveSelect: UI.Toolbar.ToolbarComboBox;
    baseSelect: UI.Toolbar.ToolbarComboBox;
    readonly filterSelect: UI.Toolbar.ToolbarComboBox;
    readonly classNameFilter: UI.Toolbar.ToolbarInput;
    readonly selectedSizeText: UI.Toolbar.ToolbarText;
    readonly popoverHelper: UI.PopoverHelper.PopoverHelper;
    currentPerspectiveIndex: number;
    currentPerspective: SummaryPerspective | ComparisonPerspective | ContainmentPerspective | AllocationPerspective | StatisticsPerspective;
    dataGrid: HeapSnapshotSortableDataGrid | null;
    readonly searchThrottler: Common.Throttler.Throttler;
    baseProfile: HeapProfileHeader | null;
    trackingOverviewGrid?: HeapTimelineOverview;
    currentSearchResultIndex: number;
    currentQuery?: HeapSnapshotModel.HeapSnapshotModel.SearchConfig;
    constructor(dataDisplayDelegate: DataDisplayDelegate, profile: HeapProfileHeader);
    createOverview(): void;
    onStopTracking(): void;
    onHeapStatsUpdate({ data: samples }: Common.EventTarget.EventTargetEvent<Samples>): void;
    searchableView(): UI.SearchableView.SearchableView;
    showProfile(profile: ProfileHeader | null): UI.Widget.Widget | null;
    showObject(snapshotObjectId: string, perspectiveName: string): void;
    linkifyObject(nodeIndex: number): Promise<Element | null>;
    populate(): Promise<void>;
    retrieveStatistics(heapSnapshotProxy: HeapSnapshotProxy): Promise<HeapSnapshotModel.HeapSnapshotModel.Statistics>;
    onIdsRangeChanged(event: Common.EventTarget.EventTargetEvent<IdsRangeChangedEvent>): void;
    toolbarItems(): Promise<UI.Toolbar.ToolbarItem[]>;
    willHide(): void;
    supportsCaseSensitiveSearch(): boolean;
    supportsRegexSearch(): boolean;
    searchCanceled(): void;
    selectRevealedNode(node: HeapSnapshotGridNode | null): void;
    performSearch(searchConfig: UI.SearchableView.SearchConfig, shouldJump: boolean, jumpBackwards?: boolean): void;
    performSearchInternal(nextQuery: HeapSnapshotModel.HeapSnapshotModel.SearchConfig): Promise<void>;
    jumpToNextSearchResult(): void;
    jumpToPreviousSearchResult(): void;
    jumpToSearchResult(searchResultIndex: number): Promise<void>;
    refreshVisibleData(): void;
    changeBase(): void;
    changeFilter(): void;
    profiles(): ProfileHeader[];
    selectionChanged(event: Common.EventTarget.EventTargetEvent<DataGrid.DataGrid.DataGridNode<HeapSnapshotGridNode>>): void;
    onSelectAllocationNode(event: Common.EventTarget.EventTargetEvent<DataGrid.DataGrid.DataGridNode<HeapSnapshotGridNode>>): void;
    inspectedObjectChanged(event: Common.EventTarget.EventTargetEvent<DataGrid.DataGrid.DataGridNode<HeapSnapshotGridNode>>): void;
    setSelectedNodeForDetailsView(nodeItem: HeapSnapshotGridNode | null): void;
    changePerspectiveAndWait(perspectiveTitle: string): Promise<void>;
    updateDataSourceAndView(): Promise<void>;
    onSelectedPerspectiveChanged(event: Event): void;
    changePerspective(selectedIndex: number): void;
    selectLiveObject(perspectiveName: string, snapshotObjectId: string): Promise<void>;
    getPopoverRequest(event: Event): UI.PopoverHelper.PopoverRequest | null;
    updatePerspectiveOptions(): void;
    updateBaseOptions(): void;
    updateFilterOptions(): void;
    updateControls(): void;
    onReceiveSnapshot(event: Common.EventTarget.EventTargetEvent<ProfileHeader>): void;
    onProfileHeaderRemoved(event: Common.EventTarget.EventTargetEvent<ProfileHeader>): void;
    dispose(): void;
}
export declare class Perspective {
    readonly titleInternal: string;
    constructor(title: string);
    activate(_heapSnapshotView: HeapSnapshotView): void;
    deactivate(heapSnapshotView: HeapSnapshotView): void;
    masterGrid(_heapSnapshotView: HeapSnapshotView): HeapSnapshotSortableDataGrid | null;
    title(): string;
    supportsSearch(): boolean;
}
export declare class SummaryPerspective extends Perspective {
    constructor();
    activate(heapSnapshotView: HeapSnapshotView): void;
    masterGrid(heapSnapshotView: HeapSnapshotView): HeapSnapshotSortableDataGrid;
    supportsSearch(): boolean;
}
export declare class ComparisonPerspective extends Perspective {
    constructor();
    activate(heapSnapshotView: HeapSnapshotView): void;
    masterGrid(heapSnapshotView: HeapSnapshotView): HeapSnapshotSortableDataGrid;
    supportsSearch(): boolean;
}
export declare class ContainmentPerspective extends Perspective {
    constructor();
    activate(heapSnapshotView: HeapSnapshotView): void;
    masterGrid(heapSnapshotView: HeapSnapshotView): HeapSnapshotSortableDataGrid;
}
export declare class AllocationPerspective extends Perspective {
    readonly allocationSplitWidget: UI.SplitWidget.SplitWidget;
    constructor();
    activate(heapSnapshotView: HeapSnapshotView): void;
    deactivate(heapSnapshotView: HeapSnapshotView): void;
    masterGrid(heapSnapshotView: HeapSnapshotView): HeapSnapshotSortableDataGrid | null;
}
export declare class StatisticsPerspective extends Perspective {
    constructor();
    activate(heapSnapshotView: HeapSnapshotView): void;
    masterGrid(_heapSnapshotView: HeapSnapshotView): HeapSnapshotSortableDataGrid | null;
}
declare const HeapSnapshotProfileType_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<HeapSnapshotProfileTypeEventTypes>;
    addEventListener<T extends HeapSnapshotProfileTypeEvents.SnapshotReceived>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<HeapSnapshotProfileTypeEventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<HeapSnapshotProfileTypeEventTypes, T>;
    once<T_1 extends HeapSnapshotProfileTypeEvents.SnapshotReceived>(eventType: T_1): Promise<HeapSnapshotProfileTypeEventTypes[T_1]>;
    removeEventListener<T_2 extends HeapSnapshotProfileTypeEvents.SnapshotReceived>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<HeapSnapshotProfileTypeEventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: HeapSnapshotProfileTypeEvents.SnapshotReceived): boolean;
    dispatchEventToListeners<T_3 extends HeapSnapshotProfileTypeEvents.SnapshotReceived>(eventType: Platform.TypeScriptUtilities.NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<HeapSnapshotProfileTypeEventTypes, T_3>): void;
}) & typeof ProfileType;
export declare class HeapSnapshotProfileType extends HeapSnapshotProfileType_base implements SDK.TargetManager.SDKModelObserver<SDK.HeapProfilerModel.HeapProfilerModel> {
    readonly exposeInternals: Common.Settings.Setting<boolean>;
    readonly captureNumericValue: Common.Settings.Setting<boolean>;
    customContentInternal: HTMLElement | null;
    constructor(id?: string, title?: string);
    modelAdded(heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel): void;
    modelRemoved(_heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel): void;
    getProfiles(): HeapProfileHeader[];
    fileExtension(): string;
    get buttonTooltip(): Common.UIString.LocalizedString;
    isInstantProfile(): boolean;
    buttonClicked(): boolean;
    get treeItemTitle(): Common.UIString.LocalizedString;
    get description(): Common.UIString.LocalizedString;
    customContent(): Element | null;
    setCustomContentEnabled(enable: boolean): void;
    createProfileLoadedFromFile(title: string): ProfileHeader;
    takeHeapSnapshot(): Promise<void>;
    addHeapSnapshotChunk(event: Common.EventTarget.EventTargetEvent<string>): void;
    reportHeapSnapshotProgress(event: Common.EventTarget.EventTargetEvent<SDK.HeapProfilerModel.HeapSnapshotProgress>): void;
    resetProfiles(event: Common.EventTarget.EventTargetEvent<SDK.HeapProfilerModel.HeapProfilerModel>): void;
    snapshotReceived(profile: ProfileHeader): void;
    static readonly TypeId: string;
    static readonly SnapshotReceived = "SnapshotReceived";
}
export declare const enum HeapSnapshotProfileTypeEvents {
    SnapshotReceived = "SnapshotReceived"
}
export declare type HeapSnapshotProfileTypeEventTypes = {
    [HeapSnapshotProfileTypeEvents.SnapshotReceived]: ProfileHeader;
};
declare const TrackingHeapSnapshotProfileType_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<TrackingHeapSnapshotProfileTypeEventTypes>;
    addEventListener<T extends keyof TrackingHeapSnapshotProfileTypeEventTypes>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<TrackingHeapSnapshotProfileTypeEventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<TrackingHeapSnapshotProfileTypeEventTypes, T>;
    once<T_1 extends keyof TrackingHeapSnapshotProfileTypeEventTypes>(eventType: T_1): Promise<TrackingHeapSnapshotProfileTypeEventTypes[T_1]>;
    removeEventListener<T_2 extends keyof TrackingHeapSnapshotProfileTypeEventTypes>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<TrackingHeapSnapshotProfileTypeEventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: keyof TrackingHeapSnapshotProfileTypeEventTypes): boolean;
    dispatchEventToListeners<T_3 extends keyof TrackingHeapSnapshotProfileTypeEventTypes>(eventType: Platform.TypeScriptUtilities.NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<TrackingHeapSnapshotProfileTypeEventTypes, T_3>): void;
}) & typeof HeapSnapshotProfileType;
export declare class TrackingHeapSnapshotProfileType extends TrackingHeapSnapshotProfileType_base {
    readonly recordAllocationStacksSettingInternal: Common.Settings.Setting<boolean>;
    customContentInternal: UI.UIUtils.CheckboxLabel | null;
    recording: boolean;
    profileSamples?: Samples | null;
    constructor();
    modelAdded(heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel): void;
    modelRemoved(heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel): void;
    heapStatsUpdate(event: Common.EventTarget.EventTargetEvent<SDK.HeapProfilerModel.HeapStatsUpdateSamples>): void;
    lastSeenObjectId(event: Common.EventTarget.EventTargetEvent<SDK.HeapProfilerModel.LastSeenObjectId>): void;
    hasTemporaryView(): boolean;
    get buttonTooltip(): Common.UIString.LocalizedString;
    isInstantProfile(): boolean;
    buttonClicked(): boolean;
    startRecordingProfile(): void;
    customContent(): Element | null;
    setCustomContentEnabled(enable: boolean): void;
    recordAllocationStacksSetting(): Common.Settings.Setting<boolean>;
    addNewProfile(): SDK.HeapProfilerModel.HeapProfilerModel | null;
    stopRecordingProfile(): Promise<void>;
    toggleRecording(): boolean;
    fileExtension(): string;
    get treeItemTitle(): Common.UIString.LocalizedString;
    get description(): Common.UIString.LocalizedString;
    resetProfiles(event: Common.EventTarget.EventTargetEvent<SDK.HeapProfilerModel.HeapProfilerModel>): void;
    profileBeingRecordedRemoved(): void;
    static readonly TypeId = "HEAP-RECORD";
    static readonly HeapStatsUpdate = "HeapStatsUpdate";
    static readonly TrackingStarted = "TrackingStarted";
    static readonly TrackingStopped = "TrackingStopped";
}
export declare const enum TrackingHeapSnapshotProfileTypeEvents {
    HeapStatsUpdate = "HeapStatsUpdate",
    TrackingStarted = "TrackingStarted",
    TrackingStopped = "TrackingStopped"
}
export declare type TrackingHeapSnapshotProfileTypeEventTypes = {
    [TrackingHeapSnapshotProfileTypeEvents.HeapStatsUpdate]: Samples;
    [TrackingHeapSnapshotProfileTypeEvents.TrackingStarted]: void;
    [TrackingHeapSnapshotProfileTypeEvents.TrackingStopped]: void;
};
export declare class HeapProfileHeader extends ProfileHeader {
    readonly heapProfilerModelInternal: SDK.HeapProfilerModel.HeapProfilerModel | null;
    maxJSObjectId: number;
    workerProxy: HeapSnapshotWorkerProxy | null;
    receiver: Common.StringOutputStream.OutputStream | null;
    snapshotProxy: HeapSnapshotProxy | null;
    readonly loadPromise: Promise<HeapSnapshotProxy>;
    fulfillLoad?: (value: HeapSnapshotProxy | PromiseLike<HeapSnapshotProxy>) => void;
    totalNumberOfChunks: number;
    bufferedWriter: Bindings.TempFile.TempFile | null;
    onTempFileReady: (() => void) | null;
    failedToCreateTempFile?: boolean;
    wasDisposed?: boolean;
    fileName?: Platform.DevToolsPath.RawPathString;
    constructor(heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel | null, type: HeapSnapshotProfileType, title?: string);
    heapProfilerModel(): SDK.HeapProfilerModel.HeapProfilerModel | null;
    getLocation(nodeIndex: number): Promise<HeapSnapshotModel.HeapSnapshotModel.Location | null>;
    createSidebarTreeElement(dataDisplayDelegate: DataDisplayDelegate): ProfileSidebarTreeElement;
    createView(dataDisplayDelegate: DataDisplayDelegate): HeapSnapshotView;
    prepareToLoad(): void;
    finishLoad(): void;
    didWriteToTempFile(tempFile: Bindings.TempFile.TempFile): void;
    setupWorker(): void;
    handleWorkerEvent(eventName: string, data: any): void;
    dispose(): void;
    didCompleteSnapshotTransfer(): void;
    transferChunk(chunk: string): void;
    snapshotReceived(snapshotProxy: HeapSnapshotProxy): void;
    notifySnapshotReceived(): void;
    canSaveToFile(): boolean;
    saveToFile(): void;
    onChunkTransferred(reader: Bindings.FileUtils.ChunkedReader): void;
    updateSaveProgress(value: number, total: number): void;
    loadFromFile(file: File): Promise<DOMError | null>;
    profileType(): HeapSnapshotProfileType;
}
export declare class HeapSnapshotStatisticsView extends UI.Widget.VBox {
    pieChart: PerfUI.PieChart.PieChart;
    constructor();
    static valueFormatter(value: number): string;
    setTotalAndRecords(total: number, records: PerfUI.PieChart.Slice[]): void;
}
export declare class HeapAllocationStackView extends UI.Widget.Widget {
    readonly heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel | null;
    readonly linkifier: Components.Linkifier.Linkifier;
    frameElements: HTMLElement[];
    constructor(heapProfilerModel: SDK.HeapProfilerModel.HeapProfilerModel | null);
    onContextMenu(link: Element, event: Event): void;
    onStackViewKeydown(event: KeyboardEvent): void;
    setAllocatedObject(snapshot: HeapSnapshotProxy, snapshotNodeIndex: number): Promise<void>;
    clear(): void;
}
export {};

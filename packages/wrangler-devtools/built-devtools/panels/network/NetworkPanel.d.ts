import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as NetworkForward from '../../panels/network/forward/forward.js';
import * as PerfUI from '../../ui/legacy/components/perf_ui/perf_ui.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as Search from '../search/search.js';
import { NetworkItemView } from './NetworkItemView.js';
import { NetworkLogView } from './NetworkLogView.js';
import type { NetworkTimeCalculator } from './NetworkTimeCalculator.js';
export declare class NetworkPanel extends UI.Panel.Panel implements UI.ContextMenu.Provider, UI.View.ViewLocationResolver {
    private readonly networkLogShowOverviewSetting;
    private readonly networkLogLargeRowsSetting;
    private readonly networkRecordFilmStripSetting;
    private readonly toggleRecordAction;
    private pendingStopTimer;
    networkItemView: NetworkItemView | null;
    private filmStripView;
    private filmStripRecorder;
    private currentRequest;
    private readonly panelToolbar;
    private readonly rightToolbar;
    private readonly filterBar;
    private readonly settingsPane;
    private showSettingsPaneSetting;
    private readonly filmStripPlaceholderElement;
    private readonly overviewPane;
    private readonly networkOverview;
    private readonly overviewPlaceholderElement;
    private readonly calculator;
    private splitWidget;
    private readonly sidebarLocation;
    private readonly progressBarContainer;
    networkLogView: NetworkLogView;
    private readonly fileSelectorElement;
    private readonly detailsWidget;
    private readonly closeButtonElement;
    private preserveLogSetting;
    recordLogSetting: Common.Settings.Setting<boolean>;
    private readonly throttlingSelect;
    constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): NetworkPanel;
    static revealAndFilter(filters: {
        filterType: NetworkForward.UIFilter.FilterType | null;
        filterValue: string;
    }[]): Promise<void>;
    static selectAndShowRequest(request: SDK.NetworkRequest.NetworkRequest, tab: NetworkForward.UIRequestLocation.UIRequestTabs, options?: NetworkForward.UIRequestLocation.FilterOptions): Promise<void>;
    throttlingSelectForTest(): UI.Toolbar.ToolbarComboBox;
    private onWindowChanged;
    private searchToggleClick;
    private setupToolbarButtons;
    private updateSettingsPaneVisibility;
    private createThrottlingConditionsSelect;
    toggleRecord(toggled: boolean): void;
    private filmStripAvailable;
    private onNetworkLogReset;
    private willReloadPage;
    private load;
    private stopFilmStripRecording;
    private toggleLargerRequests;
    private toggleShowOverview;
    private toggleRecordFilmStrip;
    private resetFilmStripView;
    elementsToRestoreScrollPositionsFor(): Element[];
    wasShown(): void;
    willHide(): void;
    revealAndHighlightRequest(request: SDK.NetworkRequest.NetworkRequest): void;
    revealAndHighlightRequestWithId(request: NetworkForward.NetworkRequestId.NetworkRequestId): void;
    selectAndActivateRequest(request: SDK.NetworkRequest.NetworkRequest, shownTab?: NetworkForward.UIRequestLocation.UIRequestTabs, options?: NetworkForward.UIRequestLocation.FilterOptions): Promise<NetworkItemView | null>;
    private handleFilterChanged;
    private onRowSizeChanged;
    private onRequestSelected;
    private onRequestActivated;
    private showRequestPanel;
    hideRequestPanel(): void;
    private updateNetworkItemView;
    private clearNetworkItemView;
    private createNetworkItemView;
    private updateUI;
    appendApplicableItems(this: NetworkPanel, event: Event, contextMenu: UI.ContextMenu.ContextMenu, target: Object): void;
    private onFilmFrameSelected;
    private onFilmFrameEnter;
    private onFilmFrameExit;
    private onUpdateRequest;
    resolveLocation(locationName: string): UI.View.ViewLocation | null;
}
export declare const displayScreenshotDelay = 1000;
export declare class ContextMenuProvider implements UI.ContextMenu.Provider {
    static instance(opts?: {
        forceNew: boolean | null;
    }): ContextMenuProvider;
    appendApplicableItems(event: Event, contextMenu: UI.ContextMenu.ContextMenu, target: Object): void;
}
export declare class RequestRevealer implements Common.Revealer.Revealer {
    static instance(opts?: {
        forceNew: boolean | null;
    }): RequestRevealer;
    reveal(request: Object): Promise<void>;
}
export declare class RequestIdRevealer implements Common.Revealer.Revealer {
    static instance(opts?: {
        forceNew: boolean | null;
    }): RequestIdRevealer;
    reveal(requestId: Object): Promise<void>;
}
export declare class NetworkLogWithFilterRevealer implements Common.Revealer.Revealer {
    static instance(opts?: {
        forceNew: boolean | null;
    }): NetworkLogWithFilterRevealer;
    reveal(request: Object): Promise<void>;
}
export declare class FilmStripRecorder implements SDK.TracingManager.TracingManagerClient {
    private tracingManager;
    private resourceTreeModel;
    private readonly timeCalculator;
    private readonly filmStripView;
    private tracingModel;
    private callback;
    constructor(timeCalculator: NetworkTimeCalculator, filmStripView: PerfUI.FilmStripView.FilmStripView);
    traceEventsCollected(events: SDK.TracingManager.EventPayload[]): void;
    tracingComplete(): void;
    tracingBufferUsage(): void;
    eventsRetrievalProgress(_progress: number): void;
    startRecording(): void;
    isRecording(): boolean;
    stopRecording(callback: (arg0: SDK.FilmStripModel.FilmStripModel | null) => void): void;
}
export declare class ActionDelegate implements UI.ActionRegistration.ActionDelegate {
    static instance(opts?: {
        forceNew: boolean | null;
    } | undefined): ActionDelegate;
    handleAction(context: UI.Context.Context, actionId: string): boolean;
}
export declare class RequestLocationRevealer implements Common.Revealer.Revealer {
    static instance(opts?: {
        forceNew: boolean | null;
    } | undefined): RequestLocationRevealer;
    reveal(match: Object): Promise<void>;
}
export declare class SearchNetworkView extends Search.SearchView.SearchView {
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): SearchNetworkView;
    static openSearch(query: string, searchImmediately?: boolean): Promise<Search.SearchView.SearchView>;
    createScope(): Search.SearchConfig.SearchScope;
}

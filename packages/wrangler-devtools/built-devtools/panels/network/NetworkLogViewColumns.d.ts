import * as Common from '../../core/common/common.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import type { NetworkNode } from './NetworkDataGridNode.js';
import type { NetworkLogView } from './NetworkLogView.js';
import type { NetworkTimeCalculator, NetworkTransferDurationCalculator, NetworkTransferTimeCalculator } from './NetworkTimeCalculator.js';
export declare class NetworkLogViewColumns {
    private networkLogView;
    private readonly persistantSettings;
    private readonly networkLogLargeRowsSetting;
    private readonly eventDividers;
    private eventDividersShown;
    private gridMode;
    private columns;
    private waterfallRequestsAreStale;
    private waterfallScrollerWidthIsStale;
    private readonly popupLinkifier;
    private calculatorsMap;
    private lastWheelTime;
    private dataGridInternal;
    private splitWidget;
    private waterfallColumn;
    private activeScroller;
    private dataGridScroller;
    private waterfallScroller;
    private waterfallScrollerContent;
    private waterfallHeaderElement;
    private waterfallColumnSortIcon;
    private activeWaterfallSortId;
    private popoverHelper?;
    private hasScrollerTouchStarted?;
    private scrollerTouchStartPos?;
    constructor(networkLogView: NetworkLogView, timeCalculator: NetworkTransferTimeCalculator, durationCalculator: NetworkTransferDurationCalculator, networkLogLargeRowsSetting: Common.Settings.Setting<boolean>);
    private static convertToDataGridDescriptor;
    wasShown(): void;
    willHide(): void;
    reset(): void;
    private setupDataGrid;
    private setupWaterfall;
    private onMouseWheel;
    private onTouchStart;
    private onTouchMove;
    private onTouchEnd;
    private syncScrollers;
    private updateScrollerWidthIfNeeded;
    private redrawWaterfallColumn;
    private createWaterfallHeader;
    setCalculator(x: NetworkTimeCalculator): void;
    scheduleRefresh(): void;
    private updateRowsSize;
    show(element: Element): void;
    setHidden(value: boolean): void;
    dataGrid(): DataGrid.SortableDataGrid.SortableDataGrid<NetworkNode>;
    sortByCurrentColumn(): void;
    private sortHandler;
    private dataGridSortedForTest;
    private updateColumns;
    switchViewMode(gridMode: boolean): void;
    private toggleColumnVisibility;
    private saveColumnsSettings;
    private loadCustomColumnsAndSettings;
    private makeHeaderFragment;
    private innerHeaderContextMenu;
    private manageCustomHeaderDialog;
    private removeCustomHeader;
    private addCustomHeader;
    private changeCustomHeader;
    private getPopoverRequest;
    addEventDividers(times: number[], className: string): void;
    hideEventDividers(): void;
    showEventDividers(): void;
    selectFilmStripFrame(time: number): void;
    clearFilmStripFrame(): void;
}
export declare const _initialSortColumn = "waterfall";
export declare enum _calculatorTypes {
    Duration = "Duration",
    Time = "Time"
}
export declare const _defaultColumnConfig: Object;
export declare const _filmStripDividerColor = "#fccc49";
export declare enum WaterfallSortIds {
    StartTime = "startTime",
    ResponseTime = "responseReceivedTime",
    EndTime = "endTime",
    Duration = "duration",
    Latency = "latency"
}
export interface Descriptor {
    id: string;
    title: string | (() => string);
    titleDOMFragment?: DocumentFragment;
    subtitle: string | (() => string) | null;
    visible: boolean;
    weight: number;
    hideable: boolean;
    hideableGroup: string | null;
    nonSelectable: boolean;
    sortable: boolean;
    align?: string | null;
    isResponseHeader: boolean;
    sortingFunction: (arg0: NetworkNode, arg1: NetworkNode) => number | undefined;
    isCustomHeader: boolean;
    allowInSortByEvenWhenHidden: boolean;
}

import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as NetworkForward from '../../panels/network/forward/forward.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as Components from '../../ui/legacy/components/utils/utils.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { NetworkTimeCalculator } from './NetworkTimeCalculator.js';
export declare enum Events {
    RequestSelected = "RequestSelected",
    RequestActivated = "RequestActivated"
}
export interface RequestActivatedEvent {
    showPanel: boolean;
    takeFocus?: boolean;
    tab?: NetworkForward.UIRequestLocation.UIRequestTabs;
}
export declare type EventTypes = {
    [Events.RequestSelected]: SDK.NetworkRequest.NetworkRequest;
    [Events.RequestActivated]: RequestActivatedEvent;
};
export interface NetworkLogViewInterface extends Common.EventTarget.EventTarget<EventTypes> {
    onLoadFromFile(file: File): Promise<void>;
    nodeForRequest(request: SDK.NetworkRequest.NetworkRequest): NetworkRequestNode | null;
    headerHeight(): number;
    setRecording(recording: boolean): void;
    setWindow(start: number, end: number): void;
    resetFocus(): void;
    columnExtensionResolved(): void;
    hoveredNode(): NetworkNode | null;
    scheduleRefresh(): void;
    addFilmStripFrames(times: number[]): void;
    selectFilmStripFrame(time: number): void;
    clearFilmStripFrame(): void;
    timeCalculator(): NetworkTimeCalculator;
    calculator(): NetworkTimeCalculator;
    setCalculator(x: NetworkTimeCalculator): void;
    flatNodesList(): NetworkNode[];
    updateNodeBackground(): void;
    updateNodeSelectedClass(isSelected: boolean): void;
    stylesChanged(): void;
    setTextFilterValue(filterString: string): void;
    rowHeight(): number;
    switchViewMode(gridMode: boolean): void;
    handleContextMenuForRequest(contextMenu: UI.ContextMenu.ContextMenu, request: SDK.NetworkRequest.NetworkRequest): void;
    exportAll(): Promise<void>;
    revealAndHighlightRequest(request: SDK.NetworkRequest.NetworkRequest): void;
    selectRequest(request: SDK.NetworkRequest.NetworkRequest): void;
    removeAllNodeHighlights(): void;
    modelAdded(model: SDK.NetworkManager.NetworkManager): void;
    modelRemoved(model: SDK.NetworkManager.NetworkManager): void;
    linkifier(): Components.Linkifier.Linkifier;
}
export declare class NetworkNode extends DataGrid.SortableDataGrid.SortableDataGridNode<NetworkNode> {
    private readonly parentViewInternal;
    private isHovered;
    private showingInitiatorChainInternal;
    private requestOrFirstKnownChildRequestInternal;
    constructor(parentView: NetworkLogViewInterface);
    displayName(): string;
    displayType(): string;
    createCell(columnId: string): HTMLElement;
    renderCell(cell: Element, columnId: string): void;
    isFailed(): boolean;
    backgroundColor(): string;
    updateBackgroundColor(): void;
    setStriped(isStriped: boolean): void;
    select(supressSelectedEvent?: boolean): void;
    deselect(supressSelectedEvent?: boolean): void;
    parentView(): NetworkLogViewInterface;
    hovered(): boolean;
    showingInitiatorChain(): boolean;
    nodeSelfHeight(): number;
    setHovered(hovered: boolean, showInitiatorChain: boolean): void;
    showingInitiatorChainChanged(): void;
    isOnInitiatorPath(): boolean;
    isOnInitiatedPath(): boolean;
    request(): SDK.NetworkRequest.NetworkRequest | null;
    isNavigationRequest(): boolean;
    clearFlatNodes(): void;
    requestOrFirstKnownChildRequest(): SDK.NetworkRequest.NetworkRequest | null;
}
export declare const _backgroundColors: {
    [x: string]: string;
};
export declare class NetworkRequestNode extends NetworkNode {
    private nameCell;
    private initiatorCell;
    private requestInternal;
    private readonly isNavigationRequestInternal;
    selectable: boolean;
    private isOnInitiatorPathInternal;
    private isOnInitiatedPathInternal;
    private linkifiedInitiatorAnchor?;
    constructor(parentView: NetworkLogViewInterface, request: SDK.NetworkRequest.NetworkRequest);
    static NameComparator(a: NetworkNode, b: NetworkNode): number;
    static RemoteAddressComparator(a: NetworkNode, b: NetworkNode): number;
    static SizeComparator(a: NetworkNode, b: NetworkNode): number;
    static TypeComparator(a: NetworkNode, b: NetworkNode): number;
    static InitiatorComparator(a: NetworkNode, b: NetworkNode): number;
    static InitiatorAddressSpaceComparator(a: NetworkNode, b: NetworkNode): number;
    static RemoteAddressSpaceComparator(a: NetworkNode, b: NetworkNode): number;
    static RequestCookiesCountComparator(a: NetworkNode, b: NetworkNode): number;
    static ResponseCookiesCountComparator(a: NetworkNode, b: NetworkNode): number;
    static PriorityComparator(a: NetworkNode, b: NetworkNode): number;
    static RequestPropertyComparator(propertyName: string, a: NetworkNode, b: NetworkNode): number;
    static RequestURLComparator(a: NetworkNode, b: NetworkNode): number;
    static ResponseHeaderStringComparator(propertyName: string, a: NetworkNode, b: NetworkNode): number;
    static ResponseHeaderNumberComparator(propertyName: string, a: NetworkNode, b: NetworkNode): number;
    static ResponseHeaderDateComparator(propertyName: string, a: NetworkNode, b: NetworkNode): number;
    showingInitiatorChainChanged(): void;
    private setIsOnInitiatorPath;
    isOnInitiatorPath(): boolean;
    private setIsOnInitiatedPath;
    isOnInitiatedPath(): boolean;
    displayType(): string;
    displayName(): string;
    request(): SDK.NetworkRequest.NetworkRequest;
    isNavigationRequest(): boolean;
    nodeSelfHeight(): number;
    createCells(element: Element): void;
    private setTextAndTitle;
    private setTextAndTitleAsLink;
    renderCell(c: Element, columnId: string): void;
    private arrayLength;
    select(supressSelectedEvent?: boolean): void;
    highlightMatchedSubstring(regexp: RegExp | null): Object[];
    private openInNewTab;
    isFailed(): boolean;
    private renderPrimaryCell;
    private renderStatusCell;
    private renderInitiatorCell;
    private renderAddressSpaceCell;
    private renderSizeCell;
    private renderTimeCell;
    private appendSubtitle;
}
export declare class NetworkGroupNode extends NetworkNode {
    createCells(element: Element): void;
    renderCell(c: Element, columnId: string): void;
    select(supressSelectedEvent?: boolean): void;
}

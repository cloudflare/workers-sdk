import * as Common from '../../../../core/common/common.js';
import * as UI from '../../legacy.js';
export declare class DataGridImpl<T> extends Common.ObjectWrapper.ObjectWrapper<EventTypes<T>> {
    element: HTMLDivElement;
    displayName: string;
    private editCallback;
    private readonly deleteCallback;
    private readonly refreshCallback;
    private dataTableHeaders;
    scrollContainerInternal: Element;
    private dataContainerInternal;
    private readonly dataTable;
    protected inline: boolean;
    private columnsArray;
    columns: {
        [x: string]: ColumnDescriptor;
    };
    visibleColumnsArray: ColumnDescriptor[];
    cellClass: string | null;
    private dataTableHeadInternal;
    private readonly headerRow;
    private readonly dataTableColumnGroup;
    dataTableBody: Element;
    topFillerRow: HTMLElement;
    private bottomFillerRow;
    private editing;
    selectedNode: DataGridNode<T> | null;
    expandNodesWhenArrowing: boolean;
    indentWidth: number;
    private resizers;
    private columnWidthsInitialized;
    private cornerWidth;
    private resizeMethod;
    private headerContextMenuCallback;
    private rowContextMenuCallback;
    elementToDataGridNode: WeakMap<Node, DataGridNode<T>>;
    disclosureColumnId?: string;
    private sortColumnCell?;
    private rootNodeInternal?;
    private editingNode?;
    private columnWeightsSetting?;
    creationNode?: CreationDataGridNode<any>;
    private currentResizer?;
    private dataGridWidget?;
    constructor(dataGridParameters: Parameters);
    private firstSelectableNode;
    private lastSelectableNode;
    setElementContent(element: Element, value: string): void;
    static setElementText(element: Element, newText: string, longText: boolean, gridNode?: DataGridNode<string>): void;
    static setElementBoolean(element: Element, value: boolean, gridNode?: DataGridNode<string>): void;
    static updateNodeAccessibleText(gridNode: DataGridNode<string>): void;
    setStriped(isStriped: boolean): void;
    setFocusable(focusable: boolean): void;
    setHasSelection(hasSelected: boolean): void;
    updateGridAccessibleName(text?: string): void;
    updateGridAccessibleNameOnFocus(): void;
    private innerAddColumn;
    addColumn(column: ColumnDescriptor, position?: number): void;
    private innerRemoveColumn;
    removeColumn(columnId: string): void;
    setCellClass(cellClass: string): void;
    private refreshHeader;
    protected setVerticalPadding(top: number, bottom: number, isConstructorTime?: boolean): void;
    protected setRootNode(rootNode: DataGridNode<T>): void;
    rootNode(): DataGridNode<T>;
    private ondblclick;
    private startEditingColumnOfDataGridNode;
    startEditingNextEditableColumnOfDataGridNode(node: DataGridNode<T>, columnIdentifier: string): void;
    private startEditing;
    renderInline(): void;
    private startEditingConfig;
    private editingCommitted;
    private editingCancelled;
    private nextEditableColumn;
    sortColumnId(): string | null;
    sortOrder(): string | null;
    isSortOrderAscending(): boolean;
    private autoSizeWidths;
    /**
     * The range of |minPercent| and |maxPercent| is [0, 100].
     */
    autoSizeColumns(minPercent: number, maxPercent?: number, maxDescentLevel?: number): void;
    private enumerateChildren;
    onResize(): void;
    updateWidths(): void;
    indexOfVisibleColumn(columnId: string): number;
    setName(name: string): void;
    private resetColumnWeights;
    private loadColumnWeights;
    private saveColumnWeights;
    wasShown(): void;
    willHide(): void;
    private getPreferredWidth;
    private applyColumnWeights;
    setColumnsVisiblity(columnsVisibility: Set<string>): void;
    get scrollContainer(): HTMLElement;
    private positionResizers;
    addCreationNode(hasChildren?: boolean): void;
    private keyDown;
    updateSelectionBeforeRemoval(root: DataGridNode<T> | null, _onlyAffectsSubtree: boolean): void;
    dataGridNodeFromNode(target: Node): DataGridNode<T> | null;
    columnIdFromNode(target: Node): string | null;
    private clickInHeaderCell;
    private sortByColumnHeaderCell;
    markColumnAsSortedBy(columnId: string, sortOrder: Order): void;
    headerTableHeader(columnId: string): Element;
    private mouseDownInDataTable;
    setHeaderContextMenuCallback(callback: ((arg0: UI.ContextMenu.SubMenu) => void) | null): void;
    setRowContextMenuCallback(callback: ((arg0: UI.ContextMenu.ContextMenu, arg1: DataGridNode<T>) => void) | null): void;
    private contextMenu;
    private clickInDataTable;
    setResizeMethod(method: ResizeMethod): void;
    private startResizerDragging;
    private endResizerDragging;
    private resizerDragging;
    private setPreferredWidth;
    columnOffset(columnId: string): number;
    asWidget(): DataGridWidget<T>;
    topFillerRowElement(): HTMLElement;
    protected headerHeightInScroller(): number;
    protected headerHeight(): number;
    revealNode(element: HTMLElement): void;
}
export declare const CornerWidth = 14;
export declare enum Events {
    SelectedNode = "SelectedNode",
    DeselectedNode = "DeselectedNode",
    OpenedNode = "OpenedNode",
    SortingChanged = "SortingChanged",
    PaddingChanged = "PaddingChanged"
}
export declare type EventTypes<T> = {
    [Events.SelectedNode]: DataGridNode<T>;
    [Events.DeselectedNode]: void;
    [Events.OpenedNode]: DataGridNode<T>;
    [Events.SortingChanged]: void;
    [Events.PaddingChanged]: void;
};
export declare enum Order {
    Ascending = "sort-ascending",
    Descending = "sort-descending"
}
export declare enum Align {
    Center = "center",
    Right = "right"
}
export declare enum DataType {
    String = "String",
    Boolean = "Boolean"
}
export declare const ColumnResizePadding = 24;
export declare const CenterResizerOverBorderAdjustment = 3;
export declare enum ResizeMethod {
    Nearest = "nearest",
    First = "first",
    Last = "last"
}
export declare type DataGridData = {
    [key: string]: any;
};
export declare class DataGridNode<T> {
    elementInternal: Element | null;
    expandedInternal: boolean;
    private selectedInternal;
    private dirty;
    private inactive;
    key: string;
    private depthInternal;
    revealedInternal: boolean | undefined;
    protected attachedInternal: boolean;
    private savedPosition;
    private shouldRefreshChildrenInternal;
    private dataInternal;
    private hasChildrenInternal;
    children: DataGridNode<T>[];
    dataGrid: DataGridImpl<T> | null;
    parent: DataGridNode<T> | null;
    previousSibling: DataGridNode<T> | null;
    nextSibling: DataGridNode<T> | null;
    disclosureToggleWidth: number;
    selectable: boolean;
    isRoot: boolean;
    nodeAccessibleText: string;
    cellAccessibleTextMap: Map<string, string>;
    isCreationNode: boolean;
    constructor(data?: DataGridData | null, hasChildren?: boolean);
    element(): Element;
    protected createElement(): Element;
    existingElement(): Element | null;
    protected resetElement(): void;
    protected createCells(element: Element): void;
    get data(): DataGridData;
    set data(x: DataGridData);
    get revealed(): boolean;
    set revealed(x: boolean);
    isDirty(): boolean;
    setDirty(dirty: boolean): void;
    isInactive(): boolean;
    setInactive(inactive: boolean): void;
    hasChildren(): boolean;
    setHasChildren(x: boolean): void;
    get depth(): number;
    get leftPadding(): number;
    get shouldRefreshChildren(): boolean;
    set shouldRefreshChildren(x: boolean);
    get selected(): boolean;
    set selected(x: boolean);
    get expanded(): boolean;
    set expanded(x: boolean);
    refresh(): void;
    createTDWithClass(className: string): HTMLElement;
    createTD(columnId: string): HTMLElement;
    createCell(columnId: string): HTMLElement;
    setCellAccessibleName(name: string, cell: Element, columnId: string): void;
    nodeSelfHeight(): number;
    appendChild(child: DataGridNode<T>): void;
    resetNode(onlyCaches?: boolean): void;
    insertChild(child: DataGridNode<T>, index: number): void;
    remove(): void;
    removeChild(child: DataGridNode<T>): void;
    removeChildren(): void;
    recalculateSiblings(myIndex: number): void;
    collapse(): void;
    collapseRecursively(): void;
    populate(): void;
    expand(): void;
    expandRecursively(): void;
    reveal(): void;
    select(supressSelectedEvent?: boolean): void;
    revealAndSelect(): void;
    deselect(supressDeselectedEvent?: boolean): void;
    traverseNextNode(skipHidden: boolean, stayWithin?: DataGridNode<T> | null, dontPopulate?: boolean, info?: {
        depthChange: number;
    }): DataGridNode<T> | null;
    traversePreviousNode(skipHidden: boolean, dontPopulate?: boolean): DataGridNode<T> | null;
    isEventWithinDisclosureTriangle(event: MouseEvent): boolean;
    private attach;
    private detach;
    savePosition(): void;
    restorePosition(): void;
}
export declare class CreationDataGridNode<T> extends DataGridNode<T> {
    isCreationNode: boolean;
    constructor(data?: {
        [x: string]: any;
    } | null, hasChildren?: boolean);
    makeNormal(): void;
}
export declare class DataGridWidget<T> extends UI.Widget.VBox {
    private readonly dataGrid;
    constructor(dataGrid: DataGridImpl<T>);
    wasShown(): void;
    willHide(): void;
    onResize(): void;
    elementsToRestoreScrollPositionsFor(): Element[];
}
export interface Parameters {
    displayName: string;
    columns: ColumnDescriptor[];
    editCallback?: ((arg0: any, arg1: string, arg2: any, arg3: any) => void);
    deleteCallback?: ((arg0: any) => void);
    refreshCallback?: (() => void);
}
export interface ColumnDescriptor {
    id: string;
    title?: Common.UIString.LocalizedString;
    titleDOMFragment?: DocumentFragment | null;
    sortable: boolean;
    sort?: Order | null;
    align?: Align | null;
    width?: string;
    fixedWidth?: boolean;
    editable?: boolean;
    nonSelectable?: boolean;
    longText?: boolean;
    disclosure?: boolean;
    weight?: number;
    allowInSortByEvenWhenHidden?: boolean;
    dataType?: DataType | null;
    defaultWeight?: number;
}

import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as ObjectUI from '../../ui/legacy/components/object_ui/object_ui.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { Database, DatabaseId, Index, IndexedDBModel, ObjectStore } from './IndexedDBModel.js';
export declare class IDBDatabaseView extends UI.Widget.VBox {
    private readonly model;
    private database;
    private readonly reportView;
    private securityOriginElement;
    private versionElement;
    private objectStoreCountElement;
    private readonly clearButton;
    private readonly refreshButton;
    constructor(model: IndexedDBModel, database: Database | null);
    private refreshDatabase;
    private refreshDatabaseButtonClicked;
    update(database: Database): void;
    private updatedForTests;
    private deleteDatabase;
    wasShown(): void;
}
export declare class IDBDataView extends UI.View.SimpleView {
    private readonly model;
    private readonly databaseId;
    private isIndex;
    private readonly refreshObjectStoreCallback;
    private readonly refreshButton;
    private readonly deleteSelectedButton;
    private readonly clearButton;
    private readonly needsRefresh;
    private clearingObjectStore;
    private pageSize;
    private skipCount;
    private entries;
    private objectStore;
    private index;
    private keyInput;
    private dataGrid;
    private lastPageSize;
    private lastSkipCount;
    private pageBackButton;
    private pageForwardButton;
    private lastKey?;
    private summaryBarElement?;
    constructor(model: IndexedDBModel, databaseId: DatabaseId, objectStore: ObjectStore, index: Index | null, refreshObjectStoreCallback: () => void);
    private createDataGrid;
    private keyColumnHeaderFragment;
    private keyPathStringFragment;
    private createEditorToolbar;
    private pageBackButtonClicked;
    private pageForwardButtonClicked;
    private populateContextMenu;
    refreshData(): void;
    update(objectStore: ObjectStore, index: Index | null): void;
    private parseKey;
    private updateData;
    private updateSummaryBar;
    private updatedDataForTests;
    private refreshButtonClicked;
    private clearButtonClicked;
    markNeedsRefresh(): void;
    private deleteButtonClicked;
    clear(): void;
    private updateToolbarEnablement;
    wasShown(): void;
}
export declare class IDBDataGridNode extends DataGrid.DataGrid.DataGridNode<unknown> {
    selectable: boolean;
    valueObjectPresentation: ObjectUI.ObjectPropertiesSection.ObjectPropertiesSection | null;
    constructor(data: {
        [x: string]: any;
    });
    createCell(columnIdentifier: string): HTMLElement;
}

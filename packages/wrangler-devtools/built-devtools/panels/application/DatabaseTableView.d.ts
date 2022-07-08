import * as UI from '../../ui/legacy/legacy.js';
import type { Database } from './DatabaseModel.js';
export interface VisibleColumnsSetting {
    [tableName: string]: string;
}
export declare class DatabaseTableView extends UI.View.SimpleView {
    database: Database;
    tableName: string;
    private lastVisibleColumns;
    private readonly columnsMap;
    private readonly visibleColumnsSetting;
    refreshButton: UI.Toolbar.ToolbarButton;
    private readonly visibleColumnsInput;
    private dataGrid;
    private emptyWidget?;
    constructor(database: Database, tableName: string);
    wasShown(): void;
    toolbarItems(): Promise<UI.Toolbar.ToolbarItem[]>;
    private escapeTableName;
    update(): void;
    private queryFinished;
    private onVisibleColumnsChanged;
    private queryError;
    private refreshButtonClicked;
}

import * as UI from '../../ui/legacy/legacy.js';
export declare class StorageItemsView extends UI.Widget.VBox {
    private filterRegex;
    private readonly refreshButton;
    private readonly mainToolbar;
    private readonly filterItem;
    private readonly deleteAllButton;
    private readonly deleteSelectedButton;
    constructor(_title: string, _filterName: string);
    setDeleteAllTitle(title: string): void;
    setDeleteAllGlyph(glyph: string): void;
    appendToolbarItem(item: UI.Toolbar.ToolbarItem): void;
    private addButton;
    private filterChanged;
    filter<T>(items: T[], keyFunction: (arg0: T) => string): T[];
    hasFilter(): boolean;
    wasShown(): void;
    setCanDeleteAll(enabled: boolean): void;
    setCanDeleteSelected(enabled: boolean): void;
    setCanRefresh(enabled: boolean): void;
    setCanFilter(enabled: boolean): void;
    deleteAllItems(): void;
    deleteSelectedItem(): void;
    refreshItems(): void;
}

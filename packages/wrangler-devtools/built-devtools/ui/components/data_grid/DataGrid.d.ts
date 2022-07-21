import * as UI from '../../legacy/legacy.js';
import type { Column, Row, SortState } from './DataGridUtils.js';
export interface DataGridContextMenusConfiguration {
    headerRow?: (menu: UI.ContextMenu.ContextMenu, columns: readonly Column[]) => void;
    bodyRow?: (menu: UI.ContextMenu.ContextMenu, columns: readonly Column[], row: Readonly<Row>) => void;
}
export interface DataGridData {
    columns: Column[];
    rows: Row[];
    activeSort: SortState | null;
    contextMenus?: DataGridContextMenusConfiguration;
    label?: string;
}
export declare class DataGrid extends HTMLElement {
    #private;
    static readonly litTagName: import("../../lit-html/static.js").Static;
    connectedCallback(): void;
    get data(): DataGridData;
    set data(data: DataGridData);
}
declare global {
    interface HTMLElementTagNameMap {
        'devtools-data-grid': DataGrid;
    }
}

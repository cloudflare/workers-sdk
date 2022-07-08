import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { PlayerEvent } from './MediaModel.js';
export interface EventDisplayColumnConfig {
    id: string;
    title: string;
    sortable: boolean;
    weight?: number;
}
export declare const enum MediaEventColumnKeys {
    Timestamp = "displayTimestamp",
    Event = "event",
    Value = "value"
}
export declare class EventNode extends DataGrid.DataGrid.DataGridNode<EventNode> {
    private expandableElement;
    constructor(event: PlayerEvent);
    createCell(columnId: string): HTMLElement;
}
export declare class PlayerEventsView extends UI.Widget.VBox {
    private readonly dataGrid;
    private firstEventTime;
    constructor();
    private createDataGrid;
    onEvent(event: PlayerEvent): void;
    private subtractFirstEventTime;
    private static convertToGridDescriptor;
    wasShown(): void;
}

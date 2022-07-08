import * as SDK from '../../core/sdk/sdk.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class EventSourceMessagesView extends UI.Widget.VBox {
    private readonly request;
    private dataGrid;
    constructor(request: SDK.NetworkRequest.NetworkRequest);
    wasShown(): void;
    willHide(): void;
    private messageAdded;
    private sortItems;
    private onRowContextMenu;
}
export declare class EventSourceMessageNode extends DataGrid.SortableDataGrid.SortableDataGridNode<EventSourceMessageNode> {
    readonly message: SDK.NetworkRequest.EventSourceMessage;
    constructor(message: SDK.NetworkRequest.EventSourceMessage);
}
export declare function EventSourceMessageNodeComparator(fieldGetter: (arg0: SDK.NetworkRequest.EventSourceMessage) => (number | string), a: EventSourceMessageNode, b: EventSourceMessageNode): number;
export declare const Comparators: {
    [x: string]: (arg0: EventSourceMessageNode, arg1: EventSourceMessageNode) => number;
};

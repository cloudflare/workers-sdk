import * as UI from '../../ui/legacy/legacy.js';
interface CustomHeader {
    header: string;
}
export declare class NetworkManageCustomHeadersView extends UI.Widget.VBox implements UI.ListWidget.Delegate<CustomHeader> {
    private readonly list;
    private readonly columnConfigs;
    private addHeaderColumnCallback;
    private changeHeaderColumnCallback;
    private readonly removeHeaderColumnCallback;
    private editor?;
    constructor(columnData: {
        title: string;
        editable: boolean;
    }[], addHeaderColumnCallback: (arg0: string) => boolean, changeHeaderColumnCallback: (arg0: string, arg1: string) => boolean, removeHeaderColumnCallback: (arg0: string) => boolean);
    wasShown(): void;
    private headersUpdated;
    private addButtonClicked;
    renderItem(item: CustomHeader, _editable: boolean): Element;
    removeItemRequested(item: CustomHeader, _index: number): void;
    commitEdit(item: CustomHeader, editor: UI.ListWidget.Editor<CustomHeader>, isNew: boolean): void;
    beginEdit(item: CustomHeader): UI.ListWidget.Editor<CustomHeader>;
    private createEditor;
}
export {};

import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as UI from '../../ui/legacy/legacy.js';
import type * as Protocol from '../../generated/protocol.js';
export declare class LiveHeapProfileView extends UI.Widget.VBox {
    readonly gridNodeByUrl: Map<string, GridNode>;
    setting: Common.Settings.Setting<boolean>;
    readonly toggleRecordAction: UI.ActionRegistration.Action;
    readonly toggleRecordButton: UI.Toolbar.ToolbarToggle;
    readonly startWithReloadButton: UI.Toolbar.ToolbarButton | undefined;
    readonly dataGrid: DataGrid.SortableDataGrid.SortableDataGrid<GridNode>;
    currentPollId: number;
    private constructor();
    static instance(): LiveHeapProfileView;
    createDataGrid(): DataGrid.SortableDataGrid.SortableDataGrid<GridNode>;
    wasShown(): void;
    willHide(): void;
    settingChanged(value: Common.EventTarget.EventTargetEvent<boolean>): void;
    poll(): Promise<void>;
    update(isolates: SDK.IsolateManager.Isolate[], profiles: (Protocol.HeapProfiler.SamplingHeapProfile | null)[]): void;
    onKeyDown(event: KeyboardEvent): void;
    revealSourceForSelectedNode(): void;
    sortingChanged(): void;
    toggleRecording(): void;
    startRecording(reload?: boolean): void;
    stopRecording(): Promise<void>;
}
export declare class GridNode extends DataGrid.SortableDataGrid.SortableDataGridNode<unknown> {
    url: string;
    size: number;
    isolateCount: number;
    constructor(url: string, size: number, isolateCount: number);
    updateNode(size: number, isolateCount: number): void;
    createCell(columnId: string): HTMLElement;
}
export declare class ActionDelegate implements UI.ActionRegistration.ActionDelegate {
    static instance(opts?: {
        forceNew: boolean | null;
    }): ActionDelegate;
    handleAction(_context: UI.Context.Context, actionId: string): boolean;
    innerHandleAction(profilerView: LiveHeapProfileView, actionId: string): void;
}

import * as Protocol from '../../generated/protocol.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { BackgroundServiceModel } from './BackgroundServiceModel.js';
export declare class BackgroundServiceView extends UI.Widget.VBox {
    private readonly serviceName;
    private readonly model;
    private readonly serviceWorkerManager;
    private readonly securityOriginManager;
    private recordAction;
    private recordButton;
    private originCheckbox;
    private saveButton;
    private readonly toolbar;
    private readonly splitWidget;
    private readonly dataGrid;
    private readonly previewPanel;
    private selectedEventNode;
    private preview;
    static getUIString(serviceName: string): string;
    constructor(serviceName: Protocol.BackgroundService.ServiceName, model: BackgroundServiceModel);
    /**
     * Creates the toolbar UI element.
     */
    private setupToolbar;
    /**
     * Displays all available events in the grid.
     */
    private refreshView;
    /**
     * Clears the grid and panel.
     */
    private clearView;
    /**
     * Called when the `Toggle Record` button is clicked.
     */
    toggleRecording(): void;
    /**
     * Called when the `Clear` button is clicked.
     */
    private clearEvents;
    private onRecordingStateChanged;
    private updateRecordButtonTooltip;
    private onEventReceived;
    private onOriginChanged;
    private addEvent;
    private createDataGrid;
    /**
     * Creates the data object to pass to the DataGrid Node.
     */
    private createEventData;
    /**
     * Filtration function to know whether event should be shown or not.
     */
    private acceptEvent;
    private createLearnMoreLink;
    private showPreview;
    /**
     * Saves all currently displayed events in a file (JSON format).
     */
    private saveToFile;
    wasShown(): void;
}
export declare class EventDataNode extends DataGrid.DataGrid.DataGridNode<EventData> {
    private readonly eventMetadata;
    constructor(data: EventData, eventMetadata: Protocol.BackgroundService.EventMetadata[]);
    createPreview(): UI.Widget.VBox;
}
export declare class ActionDelegate implements UI.ActionRegistration.ActionDelegate {
    static instance(opts?: {
        forceNew: boolean | null;
    }): ActionDelegate;
    handleAction(context: UI.Context.Context, actionId: string): boolean;
}
export interface RecordingState {
    isRecording: boolean;
    serviceName: Protocol.BackgroundService.ServiceName;
}
export interface EventData {
    id: number;
    timestamp: string;
    origin: string;
    swScope: string;
    eventName: string;
    instanceId: string;
}

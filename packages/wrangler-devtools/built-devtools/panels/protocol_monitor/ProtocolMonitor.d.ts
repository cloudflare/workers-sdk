import * as DataGrid from '../../ui/components/data_grid/data_grid.js';
import * as UI from '../../ui/legacy/legacy.js';
export interface Message {
    id?: number;
    method: string;
    error: Object;
    result: Object;
    params: Object;
    sessionId?: string;
}
export interface LogMessage {
    id?: number;
    domain: string;
    method: string;
    params: Object;
    type: 'send' | 'recv';
}
export declare class ProtocolMonitorImpl extends UI.Widget.VBox {
    private started;
    private startTime;
    private readonly dataGridRowForId;
    private readonly infoWidget;
    private readonly dataGridIntegrator;
    private readonly filterParser;
    private readonly suggestionBuilder;
    private readonly textFilterUI;
    private messages;
    private isRecording;
    constructor();
    static instance(opts?: {
        forceNew: null;
    }): ProtocolMonitorImpl;
    wasShown(): void;
    private setRecording;
    private targetToString;
    private messageReceived;
    private messageSent;
    private saveAsFile;
}
export declare class InfoWidget extends UI.Widget.VBox {
    private readonly tabbedPane;
    constructor();
    render(data: {
        request: DataGrid.DataGridUtils.Cell | undefined;
        response: DataGrid.DataGridUtils.Cell | undefined;
        type: 'sent' | 'received' | undefined;
    } | null): void;
}

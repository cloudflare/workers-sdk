import type * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class RequestResponseView extends UI.Widget.VBox {
    request: SDK.NetworkRequest.NetworkRequest;
    private contentViewPromise;
    constructor(request: SDK.NetworkRequest.NetworkRequest);
    private static hasTextContent;
    static sourceViewForRequest(request: SDK.NetworkRequest.NetworkRequest): Promise<UI.Widget.Widget | null>;
    wasShown(): void;
    private doShowPreview;
    showPreview(): Promise<UI.Widget.Widget>;
    createPreview(): Promise<UI.Widget.Widget>;
    revealLine(line: number): Promise<void>;
}

import * as SDK from '../../../core/sdk/sdk.js';
import * as Protocol from '../../../generated/protocol.js';
import * as UI from '../../../ui/legacy/legacy.js';
export declare class RequestTrustTokensView extends UI.Widget.VBox {
    #private;
    constructor(request: SDK.NetworkRequest.NetworkRequest);
    wasShown(): void;
    willHide(): void;
}
export interface RequestTrustTokensReportData {
    params?: Readonly<Protocol.Network.TrustTokenParams>;
    result?: Readonly<Protocol.Network.TrustTokenOperationDoneEvent>;
}
export declare class RequestTrustTokensReport extends HTMLElement {
    #private;
    static readonly litTagName: import("../../../ui/lit-html/static.js").Static;
    set data(data: RequestTrustTokensReportData);
    connectedCallback(): void;
}
export declare function statusConsideredSuccess(status: Protocol.Network.TrustTokenOperationDoneEventStatus): boolean;
declare global {
    interface HTMLElementTagNameMap {
        'devtools-trust-token-report': RequestTrustTokensReport;
    }
}

import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { NetworkTimeCalculator } from './NetworkTimeCalculator.js';
export declare class RequestTimingView extends UI.Widget.VBox {
    private request;
    private calculator;
    private lastMinimumBoundary;
    private tableElement?;
    constructor(request: SDK.NetworkRequest.NetworkRequest, calculator: NetworkTimeCalculator);
    private static timeRangeTitle;
    static calculateRequestTimeRanges(request: SDK.NetworkRequest.NetworkRequest, navigationStart: number): RequestTimeRange[];
    static createTimingTable(request: SDK.NetworkRequest.NetworkRequest, calculator: NetworkTimeCalculator): Element;
    private constructFetchDetailsView;
    private getLocalizedResponseSourceForCode;
    private onToggleFetchDetails;
    wasShown(): void;
    willHide(): void;
    private refresh;
    private boundaryChanged;
}
export declare enum RequestTimeRangeNames {
    Push = "push",
    Queueing = "queueing",
    Blocking = "blocking",
    Connecting = "connecting",
    DNS = "dns",
    Proxy = "proxy",
    Receiving = "receiving",
    ReceivingPush = "receiving-push",
    Sending = "sending",
    ServiceWorker = "serviceworker",
    ServiceWorkerPreparation = "serviceworker-preparation",
    ServiceWorkerRespondWith = "serviceworker-respondwith",
    SSL = "ssl",
    Total = "total",
    Waiting = "waiting"
}
export declare const ServiceWorkerRangeNames: Set<RequestTimeRangeNames>;
export declare const ConnectionSetupRangeNames: Set<RequestTimeRangeNames>;
export interface RequestTimeRange {
    name: RequestTimeRangeNames;
    start: number;
    end: number;
}

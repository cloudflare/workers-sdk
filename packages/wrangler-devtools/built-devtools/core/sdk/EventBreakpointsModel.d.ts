import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import { CategorizedBreakpoint } from './CategorizedBreakpoint.js';
import type { Target } from './Target.js';
import { SDKModel } from './SDKModel.js';
import type { SDKModelObserver } from './TargetManager.js';
declare const enum InstrumentationNames {
    BeforeBidderWorkletBiddingStart = "beforeBidderWorkletBiddingStart",
    BeforeBidderWorkletReportingStart = "beforeBidderWorkletReportingStart",
    BeforeSellerWorkletScoringStart = "beforeSellerWorkletScoringStart",
    BeforeSellerWorkletReportingStart = "beforeSellerWorkletReportingStart"
}
export declare class EventBreakpointsModel extends SDKModel<void> {
    readonly agent: ProtocolProxyApi.EventBreakpointsApi;
    constructor(target: Target);
}
declare class EventListenerBreakpoint extends CategorizedBreakpoint {
    readonly instrumentationName: string;
    constructor(instrumentationName: InstrumentationNames, category: string);
    setEnabled(enabled: boolean): void;
    updateOnModel(model: EventBreakpointsModel): void;
    static readonly instrumentationPrefix = "instrumentation:";
}
export declare class EventBreakpointsManager implements SDKModelObserver<EventBreakpointsModel> {
    #private;
    constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): EventBreakpointsManager;
    private createInstrumentationBreakpoints;
    eventListenerBreakpoints(): EventListenerBreakpoint[];
    resolveEventListenerBreakpointTitle(auxData: {
        eventName: string;
    }): string | null;
    resolveEventListenerBreakpoint(auxData: {
        eventName: string;
    }): EventListenerBreakpoint | null;
    modelAdded(eventBreakpointModel: EventBreakpointsModel): void;
    modelRemoved(_eventBreakpointModel: EventBreakpointsModel): void;
}
export {};

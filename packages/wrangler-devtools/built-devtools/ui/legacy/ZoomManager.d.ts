import * as Common from '../../core/common/common.js';
import type * as Host from '../../core/host/host.js';
export declare class ZoomManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    private frontendHost;
    private zoomFactorInternal;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
        win: Window | null;
        frontendHost: Host.InspectorFrontendHostAPI.InspectorFrontendHostAPI | null;
    }): ZoomManager;
    static removeInstance(): void;
    zoomFactor(): number;
    cssToDIP(value: number): number;
    dipToCSS(valueDIP: number): number;
    private onWindowResize;
}
export declare const enum Events {
    ZoomChanged = "ZoomChanged"
}
export interface ZoomChangedEvent {
    from: number;
    to: number;
}
export declare type EventTypes = {
    [Events.ZoomChanged]: ZoomChangedEvent;
};

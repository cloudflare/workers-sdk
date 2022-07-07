import * as Common from '../../core/common/common.js';
import * as UI from '../../ui/legacy/legacy.js';
declare const InspectedPagePlaceholder_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends Events.Update>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends Events.Update>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends Events.Update>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: Events.Update): boolean;
    dispatchEventToListeners<T_3 extends Events.Update>(eventType: import("../../core/platform/typescript-utilities.js").NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof UI.Widget.Widget;
export declare class InspectedPagePlaceholder extends InspectedPagePlaceholder_base {
    private updateId?;
    constructor();
    static instance(opts?: {
        forceNew: null;
    }): InspectedPagePlaceholder;
    onResize(): void;
    restoreMinimumSize(): void;
    clearMinimumSize(): void;
    private dipPageRect;
    update(force?: boolean): void;
}
export declare const enum Events {
    Update = "Update"
}
export interface Bounds {
    x: number;
    y: number;
    height: number;
    width: number;
}
export declare type EventTypes = {
    [Events.Update]: Bounds;
};
export {};

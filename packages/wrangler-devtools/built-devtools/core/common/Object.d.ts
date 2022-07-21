import type * as Platform from '../platform/platform.js';
import type { EventDescriptor, EventListener, EventTarget, EventTargetEvent, EventPayloadToRestParameters } from './EventTarget.js';
export interface ListenerCallbackTuple<Events, T extends keyof Events> {
    thisObject?: Object;
    listener: EventListener<Events, T>;
    disposed?: boolean;
}
export declare class ObjectWrapper<Events> implements EventTarget<Events> {
    listeners?: Map<keyof Events, Set<ListenerCallbackTuple<Events, any>>>;
    addEventListener<T extends keyof Events>(eventType: T, listener: EventListener<Events, T>, thisObject?: Object): EventDescriptor<Events, T>;
    once<T extends keyof Events>(eventType: T): Promise<Events[T]>;
    removeEventListener<T extends keyof Events>(eventType: T, listener: EventListener<Events, T>, thisObject?: Object): void;
    hasEventListeners(eventType: keyof Events): boolean;
    dispatchEventToListeners<T extends keyof Events>(eventType: Platform.TypeScriptUtilities.NoUnion<T>, ...[eventData]: EventPayloadToRestParameters<Events, T>): void;
}
declare type Constructor = new (...args: any[]) => {};
export declare function eventMixin<Events, Base extends Constructor>(base: Base): {
    new (...args: any[]): {
        "__#6@#events": ObjectWrapper<Events>;
        addEventListener<T extends keyof Events>(eventType: T, listener: (arg0: EventTargetEvent<Events[T]>) => void, thisObject?: Object | undefined): EventDescriptor<Events, T>;
        once<T_1 extends keyof Events>(eventType: T_1): Promise<Events[T_1]>;
        removeEventListener<T_2 extends keyof Events>(eventType: T_2, listener: (arg0: EventTargetEvent<Events[T_2]>) => void, thisObject?: Object | undefined): void;
        hasEventListeners(eventType: keyof Events): boolean;
        dispatchEventToListeners<T_3 extends keyof Events>(eventType: Platform.TypeScriptUtilities.NoUnion<T_3>, ...eventData: EventPayloadToRestParameters<Events, T_3>): void;
    };
} & Base;
export {};

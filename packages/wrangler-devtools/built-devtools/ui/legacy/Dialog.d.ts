import * as Common from '../../core/common/common.js';
import { GlassPane } from './GlassPane.js';
declare const Dialog_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends Events.Hidden>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends Events.Hidden>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends Events.Hidden>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: Events.Hidden): boolean;
    dispatchEventToListeners<T_3 extends Events.Hidden>(eventType: import("../../core/platform/typescript-utilities.js").NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof GlassPane;
export declare class Dialog extends Dialog_base {
    private tabIndexBehavior;
    private tabIndexMap;
    private focusRestorer;
    private closeOnEscape;
    private targetDocument;
    private readonly targetDocumentKeyDownHandler;
    private escapeKeyCallback;
    constructor();
    static hasInstance(): boolean;
    show(where?: Document | Element): void;
    hide(): void;
    setCloseOnEscape(close: boolean): void;
    setEscapeKeyCallback(callback: (arg0: Event) => void): void;
    addCloseButton(): void;
    setOutsideTabIndexBehavior(tabIndexBehavior: OutsideTabIndexBehavior): void;
    private disableTabIndexOnElements;
    private getMainWidgetTabIndexElements;
    private restoreTabIndexOnElements;
    private onKeyDown;
    private static instance;
}
export declare const enum Events {
    Hidden = "hidden"
}
export declare type EventTypes = {
    [Events.Hidden]: void;
};
export declare enum OutsideTabIndexBehavior {
    DisableAllOutsideTabIndex = "DisableAllTabIndex",
    PreserveMainViewTabIndex = "PreserveMainViewTabIndex",
    PreserveTabIndex = "PreserveTabIndex"
}
export {};

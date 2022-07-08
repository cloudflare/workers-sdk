import * as Common from '../../core/common/common.js';
import * as UI from '../../ui/legacy/legacy.js';
declare const CSSOverviewSidebarPanel_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends keyof EventTypes>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends keyof EventTypes>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends keyof EventTypes>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: keyof EventTypes): boolean;
    dispatchEventToListeners<T_3 extends keyof EventTypes>(eventType: import("../../core/platform/typescript-utilities.js").NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof UI.Widget.VBox;
export declare class CSSOverviewSidebarPanel extends CSSOverviewSidebarPanel_base {
    #private;
    static get ITEM_CLASS_NAME(): string;
    static get SELECTED(): string;
    constructor();
    addItem(name: string, id: string): void;
    select(id: string): void;
    wasShown(): void;
}
export declare const enum SidebarEvents {
    ItemSelected = "ItemSelected",
    Reset = "Reset"
}
export declare type EventTypes = {
    [SidebarEvents.ItemSelected]: string;
    [SidebarEvents.Reset]: void;
};
export {};

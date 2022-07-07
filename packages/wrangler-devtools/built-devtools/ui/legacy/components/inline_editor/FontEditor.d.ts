import * as Common from '../../../../core/common/common.js';
import * as UI from '../../legacy.js';
declare const FontEditor_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends keyof EventTypes>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends keyof EventTypes>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends keyof EventTypes>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: keyof EventTypes): boolean;
    dispatchEventToListeners<T_3 extends keyof EventTypes>(eventType: import("../../../../core/platform/typescript-utilities.js").NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof UI.Widget.VBox;
export declare class FontEditor extends FontEditor_base {
    private readonly selectedNode;
    private readonly propertyMap;
    private readonly fontSelectorSection;
    private fontSelectors;
    private fontsList;
    constructor(propertyMap: Map<string, string>);
    wasShown(): void;
    private createFontSelectorSection;
    private createFontsList;
    private splitComputedFontArray;
    private createFontSelector;
    private deleteFontSelector;
    private updateFontSelectorList;
    private getPropertyInfo;
    private createSelector;
    private onFontSelectorChanged;
    private updatePropertyValue;
    private resizePopout;
}
export declare enum Events {
    FontChanged = "FontChanged",
    FontEditorResized = "FontEditorResized"
}
export interface FontChangedEvent {
    propertyName: string;
    value: string;
}
export declare type EventTypes = {
    [Events.FontChanged]: FontChangedEvent;
    [Events.FontEditorResized]: void;
};
export {};

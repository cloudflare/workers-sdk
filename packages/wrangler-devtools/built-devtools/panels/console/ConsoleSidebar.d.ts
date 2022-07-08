import * as Common from '../../core/common/common.js';
import type * as Platform from '../../core/platform/platform.js';
import * as UI from '../../ui/legacy/legacy.js';
import { ConsoleFilter } from './ConsoleFilter.js';
import type { ConsoleViewMessage } from './ConsoleViewMessage.js';
declare const ConsoleSidebar_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends Events.FilterSelected>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends Events.FilterSelected>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends Events.FilterSelected>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: Events.FilterSelected): boolean;
    dispatchEventToListeners<T_3 extends Events.FilterSelected>(eventType: Platform.TypeScriptUtilities.NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof UI.Widget.VBox;
export declare class ConsoleSidebar extends ConsoleSidebar_base {
    private readonly tree;
    private selectedTreeElement;
    private readonly treeElements;
    constructor();
    private appendGroup;
    clear(): void;
    onMessageAdded(viewMessage: ConsoleViewMessage): void;
    shouldBeVisible(viewMessage: ConsoleViewMessage): boolean;
    private selectionChanged;
    wasShown(): void;
}
export declare const enum Events {
    FilterSelected = "FilterSelected"
}
export declare type EventTypes = {
    [Events.FilterSelected]: void;
};
declare class ConsoleSidebarTreeElement extends UI.TreeOutline.TreeElement {
    protected filterInternal: ConsoleFilter;
    constructor(title: string | Node, filter: ConsoleFilter);
    filter(): ConsoleFilter;
}
export declare class URLGroupTreeElement extends ConsoleSidebarTreeElement {
    private countElement;
    private messageCount;
    constructor(filter: ConsoleFilter);
    incrementAndUpdateCounter(): void;
}
export declare class FilterTreeElement extends ConsoleSidebarTreeElement {
    private readonly selectedFilterSetting;
    private readonly urlTreeElements;
    private messageCount;
    private uiStringForFilterCount;
    constructor(filter: ConsoleFilter, icon: UI.Icon.Icon, selectedFilterSetting: Common.Settings.Setting<string>);
    clear(): void;
    name(): string;
    onselect(selectedByUser?: boolean): boolean;
    private updateCounter;
    private updateGroupTitle;
    onMessageAdded(viewMessage: ConsoleViewMessage): void;
    private childElement;
}
export {};

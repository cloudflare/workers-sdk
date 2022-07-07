import * as Common from '../../core/common/common.js';
import type { Suggestions } from './SuggestBox.js';
import type { ToolbarButton } from './Toolbar.js';
import { HBox } from './Widget.js';
declare const FilterBar_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<FilterBarEventTypes>;
    addEventListener<T extends FilterBarEvents.Changed>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<FilterBarEventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<FilterBarEventTypes, T>;
    once<T_1 extends FilterBarEvents.Changed>(eventType: T_1): Promise<FilterBarEventTypes[T_1]>;
    removeEventListener<T_2 extends FilterBarEvents.Changed>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<FilterBarEventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: FilterBarEvents.Changed): boolean;
    dispatchEventToListeners<T_3 extends FilterBarEvents.Changed>(eventType: import("../../core/platform/typescript-utilities.js").NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<FilterBarEventTypes, T_3>): void;
}) & typeof HBox;
export declare class FilterBar extends FilterBar_base {
    private enabled;
    private readonly stateSetting;
    private readonly filterButtonInternal;
    private filters;
    private alwaysShowFilters?;
    private showingWidget?;
    constructor(name: string, visibleByDefault?: boolean);
    filterButton(): ToolbarButton;
    addFilter(filter: FilterUI): void;
    setEnabled(enabled: boolean): void;
    forceShowFilterBar(): void;
    showOnce(): void;
    private filterChanged;
    wasShown(): void;
    private updateFilterBar;
    focus(): void;
    private updateFilterButton;
    clear(): void;
    setting(): Common.Settings.Setting<boolean>;
    visible(): boolean;
}
export declare const enum FilterBarEvents {
    Changed = "Changed"
}
export declare type FilterBarEventTypes = {
    [FilterBarEvents.Changed]: void;
};
export interface FilterUI extends Common.EventTarget.EventTarget<FilterUIEventTypes> {
    isActive(): boolean;
    element(): Element;
}
export declare const enum FilterUIEvents {
    FilterChanged = "FilterChanged"
}
export declare type FilterUIEventTypes = {
    [FilterUIEvents.FilterChanged]: void;
};
export declare class TextFilterUI extends Common.ObjectWrapper.ObjectWrapper<FilterUIEventTypes> implements FilterUI {
    private readonly filterElement;
    private readonly filterInputElement;
    private prompt;
    private readonly proxyElement;
    private suggestionProvider;
    constructor();
    private completions;
    isActive(): boolean;
    element(): Element;
    value(): string;
    setValue(value: string): void;
    focus(): void;
    setSuggestionProvider(suggestionProvider: (arg0: string, arg1: string, arg2?: boolean | undefined) => Promise<Suggestions>): void;
    private valueChanged;
    private updateEmptyStyles;
    clear(): void;
}
export declare class NamedBitSetFilterUI extends Common.ObjectWrapper.ObjectWrapper<FilterUIEventTypes> implements FilterUI {
    private readonly filtersElement;
    private readonly typeFilterElementTypeNames;
    private allowedTypes;
    private readonly typeFilterElements;
    private readonly setting;
    constructor(items: Item[], setting?: Common.Settings.Setting<{
        [key: string]: boolean;
    }>);
    reset(): void;
    isActive(): boolean;
    element(): Element;
    accept(typeName: string): boolean;
    private settingChanged;
    private update;
    private addBit;
    private onTypeFilterClicked;
    private onTypeFilterKeydown;
    private keyFocusNextBit;
    private toggleTypeFilter;
    static readonly ALL_TYPES = "all";
}
export declare class CheckboxFilterUI extends Common.ObjectWrapper.ObjectWrapper<FilterUIEventTypes> implements FilterUI {
    private readonly filterElement;
    private readonly activeWhenChecked;
    private label;
    private checkboxElement;
    constructor(className: string, title: string, activeWhenChecked?: boolean, setting?: Common.Settings.Setting<boolean>);
    isActive(): boolean;
    checked(): boolean;
    setChecked(checked: boolean): void;
    element(): HTMLDivElement;
    labelElement(): Element;
    private fireUpdated;
    setColor(backgroundColor: string, borderColor: string): void;
}
export interface Item {
    name: string;
    label: () => string;
    title?: string;
}
export {};

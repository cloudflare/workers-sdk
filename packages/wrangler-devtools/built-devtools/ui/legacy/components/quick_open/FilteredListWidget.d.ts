import * as Common from '../../../../core/common/common.js';
import * as Platform from '../../../../core/platform/platform.js';
import * as UI from '../../legacy.js';
declare const FilteredListWidget_base: (new (...args: any[]) => {
    "__#6@#events": Common.ObjectWrapper.ObjectWrapper<EventTypes>;
    addEventListener<T extends Events.Hidden>(eventType: T, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T]>) => void, thisObject?: Object | undefined): Common.EventTarget.EventDescriptor<EventTypes, T>;
    once<T_1 extends Events.Hidden>(eventType: T_1): Promise<EventTypes[T_1]>;
    removeEventListener<T_2 extends Events.Hidden>(eventType: T_2, listener: (arg0: Common.EventTarget.EventTargetEvent<EventTypes[T_2]>) => void, thisObject?: Object | undefined): void;
    hasEventListeners(eventType: Events.Hidden): boolean;
    dispatchEventToListeners<T_3 extends Events.Hidden>(eventType: Platform.TypeScriptUtilities.NoUnion<T_3>, ...eventData: Common.EventTarget.EventPayloadToRestParameters<EventTypes, T_3>): void;
}) & typeof UI.Widget.VBox;
export declare class FilteredListWidget extends FilteredListWidget_base implements UI.ListControl.ListDelegate<number> {
    private promptHistory;
    private scoringTimer;
    private filterTimer;
    private loadTimeout;
    private refreshListWithCurrentResult;
    private dialog;
    private query;
    private readonly inputBoxElement;
    private readonly hintElement;
    private readonly bottomElementsContainer;
    private readonly progressElement;
    private progressBarElement;
    private readonly items;
    private list;
    private readonly itemElementsContainer;
    private notFoundElement;
    private prefix;
    private provider;
    private readonly queryChangedCallback?;
    constructor(provider: Provider | null, promptHistory?: string[], queryChangedCallback?: ((arg0: string) => void));
    static highlightRanges(element: Element, query: string, caseInsensitive?: boolean): boolean;
    setCommandPrefix(commandPrefix: string): void;
    setCommandSuggestion(suggestion: string): void;
    setHintElement(hint: string): void;
    /**
     * Sets the text prompt's accessible title. By default, it is "Quick open prompt".
     */
    setPromptTitle(title: string): void;
    showAsDialog(dialogTitle?: string): void;
    setPrefix(prefix: string): void;
    setProvider(provider: Provider | null): void;
    setQuerySelectedRange(startIndex: number, endIndex: number): void;
    private attachProvider;
    private cleanValue;
    wasShown(): void;
    willHide(): void;
    private clearTimers;
    private onEnter;
    private itemsLoaded;
    private updateAfterItemsLoaded;
    createElementForItem(item: number): Element;
    heightForItem(_item: number): number;
    isItemSelectable(_item: number): boolean;
    selectedItemChanged(_from: number | null, _to: number | null, fromElement: Element | null, toElement: Element | null): void;
    private onClick;
    private onMouseMove;
    setQuery(query: string): void;
    private tabKeyPressed;
    private itemsFilteredForTest;
    private filterItems;
    private refreshList;
    private updateNotFoundMessage;
    private onInput;
    private queryChanged;
    updateSelectedItemARIA(_fromElement: Element | null, _toElement: Element | null): boolean;
    private onKeyDown;
    private scheduleFilter;
    private selectItem;
}
export declare const enum Events {
    Hidden = "hidden"
}
export declare type EventTypes = {
    [Events.Hidden]: void;
};
export declare class Provider {
    private refreshCallback;
    constructor();
    setRefreshCallback(refreshCallback: () => void): void;
    attach(): void;
    itemCount(): number;
    itemKeyAt(_itemIndex: number): string;
    itemScoreAt(_itemIndex: number, _query: string): number;
    renderItem(_itemIndex: number, _query: string, _titleElement: Element, _subtitleElement: Element): void;
    renderAsTwoRows(): boolean;
    selectItem(_itemIndex: number | null, _promptValue: string): void;
    refresh(): void;
    rewriteQuery(query: string): string;
    queryChanged(_query: string): void;
    notFoundText(_query: string): string;
    detach(): void;
}
export declare function registerProvider(registration: ProviderRegistration): void;
export declare function getRegisteredProviders(): ProviderRegistration[];
export interface ProviderRegistration {
    prefix: string;
    iconName: string;
    provider: () => Promise<Provider>;
    titlePrefix: (() => string);
    titleSuggestion?: (() => string);
}
export {};

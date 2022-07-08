import { VBox } from './Widget.js';
export declare class SearchableView extends VBox {
    private searchProvider;
    private replaceProvider;
    private setting;
    private replaceable;
    private readonly footerElementContainer;
    private readonly footerElement;
    private replaceToggleButton;
    private searchInputElement;
    private matchesElement;
    private searchNavigationPrevElement;
    private searchNavigationNextElement;
    private readonly replaceInputElement;
    private readonly buttonsContainer;
    private caseSensitiveButton;
    private regexButton;
    private readonly secondRowButtons;
    private replaceButtonElement;
    private replaceAllButtonElement;
    private minimalSearchQuerySize;
    private searchIsVisible?;
    private currentQuery?;
    private valueChangedTimeoutId?;
    constructor(searchable: Searchable, replaceable: Replaceable | null, settingName?: string);
    static fromElement(element: Element | null): SearchableView | null;
    private toggleCaseSensitiveSearch;
    private toggleRegexSearch;
    private toggleReplace;
    private saveSetting;
    private loadSetting;
    setMinimalSearchQuerySize(minimalSearchQuerySize: number): void;
    setPlaceholder(placeholder: string, ariaLabel?: string): void;
    setReplaceable(replaceable: boolean): void;
    updateSearchMatchesCount(matches: number): void;
    updateCurrentMatchIndex(currentMatchIndex: number): void;
    isSearchVisible(): boolean;
    closeSearch(): void;
    private toggleSearchBar;
    cancelSearch(): void;
    resetSearch(): void;
    refreshSearch(): void;
    handleFindNextShortcut(): boolean;
    handleFindPreviousShortcut(): boolean;
    handleFindShortcut(): boolean;
    handleCancelSearchShortcut(): boolean;
    private updateSearchNavigationButtonState;
    private updateSearchMatchesCountAndCurrentMatchIndex;
    showSearchField(): void;
    private updateReplaceVisibility;
    private onSearchKeyDown;
    private onReplaceKeyDown;
    private jumpToNextSearchResult;
    private onNextButtonSearch;
    private onPrevButtonSearch;
    private onFindClick;
    private onPreviousClick;
    private clearSearch;
    private performSearch;
    private currentSearchConfig;
    private updateSecondRowVisibility;
    private replace;
    private replaceAll;
    private onInput;
    private onValueChanged;
}
export declare const _symbol: unique symbol;
export interface Searchable {
    searchCanceled(): void;
    performSearch(searchConfig: SearchConfig, shouldJump: boolean, jumpBackwards?: boolean): void;
    jumpToNextSearchResult(): void;
    jumpToPreviousSearchResult(): void;
    supportsCaseSensitiveSearch(): boolean;
    supportsRegexSearch(): boolean;
}
export interface Replaceable {
    replaceSelectionWith(searchConfig: SearchConfig, replacement: string): void;
    replaceAllWith(searchConfig: SearchConfig, replacement: string): void;
}
export interface SearchRegexResult {
    regex: RegExp;
    fromQuery: boolean;
}
export declare class SearchConfig {
    query: string;
    caseSensitive: boolean;
    isRegex: boolean;
    constructor(query: string, caseSensitive: boolean, isRegex: boolean);
    toSearchRegex(global?: boolean): SearchRegexResult;
}

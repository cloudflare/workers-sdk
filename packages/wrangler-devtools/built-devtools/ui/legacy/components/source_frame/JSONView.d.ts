import * as UI from '../../legacy.js';
export declare class JSONView extends UI.Widget.VBox implements UI.SearchableView.Searchable {
    private initialized;
    private readonly parsedJSON;
    private startCollapsed;
    private searchableView;
    private treeOutline;
    private currentSearchFocusIndex;
    private currentSearchTreeElements;
    private searchRegex;
    constructor(parsedJSON: ParsedJSON, startCollapsed?: boolean);
    static createView(content: string): Promise<UI.SearchableView.SearchableView | null>;
    static createViewSync(obj: Object | null): UI.SearchableView.SearchableView;
    private static parseJSON;
    private static extractJSON;
    private static findBrackets;
    wasShown(): void;
    private initialize;
    private jumpToMatch;
    private updateSearchCount;
    private updateSearchIndex;
    searchCanceled(): void;
    performSearch(searchConfig: UI.SearchableView.SearchConfig, shouldJump: boolean, jumpBackwards?: boolean): void;
    jumpToNextSearchResult(): void;
    jumpToPreviousSearchResult(): void;
    supportsCaseSensitiveSearch(): boolean;
    supportsRegexSearch(): boolean;
}
export declare class ParsedJSON {
    data: any;
    prefix: string;
    suffix: string;
    constructor(data: any, prefix: string, suffix: string);
}

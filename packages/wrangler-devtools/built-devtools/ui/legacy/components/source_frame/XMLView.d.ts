import * as UI from '../../legacy.js';
export declare class XMLView extends UI.Widget.Widget implements UI.SearchableView.Searchable {
    private readonly treeOutline;
    private searchableView;
    private currentSearchFocusIndex;
    private currentSearchTreeElements;
    private searchConfig;
    constructor(parsedXML: Document);
    static createSearchableView(parsedXML: Document): UI.SearchableView.SearchableView;
    static parseXML(text: string, mimeType: string): Document | null;
    private jumpToMatch;
    private updateSearchCount;
    private updateSearchIndex;
    innerPerformSearch(shouldJump: boolean, jumpBackwards?: boolean): void;
    private innerSearchCanceled;
    searchCanceled(): void;
    performSearch(searchConfig: UI.SearchableView.SearchConfig, shouldJump: boolean, jumpBackwards?: boolean): void;
    jumpToNextSearchResult(): void;
    jumpToPreviousSearchResult(): void;
    supportsCaseSensitiveSearch(): boolean;
    supportsRegexSearch(): boolean;
}
export declare class XMLViewNode extends UI.TreeOutline.TreeElement {
    private readonly node;
    private readonly closeTag;
    private highlightChanges;
    private readonly xmlView;
    constructor(node: Node | ParentNode, closeTag: boolean, xmlView: XMLView);
    static populate(root: UI.TreeOutline.TreeOutline | UI.TreeOutline.TreeElement, xmlNode: Node | ParentNode, xmlView: XMLView): void;
    setSearchRegex(regex: RegExp | null, additionalCssClassName?: string): boolean;
    revertHighlightChanges(): void;
    private updateTitle;
    private setTitle;
    onattach(): void;
    onexpand(): void;
    oncollapse(): void;
    onpopulate(): Promise<void>;
}

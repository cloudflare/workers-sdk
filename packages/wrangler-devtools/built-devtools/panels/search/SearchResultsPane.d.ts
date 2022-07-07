import * as UI from '../../ui/legacy/legacy.js';
import type { SearchConfig, SearchResult } from './SearchConfig.js';
export declare class SearchResultsPane extends UI.Widget.VBox {
    private readonly searchConfig;
    private readonly searchResults;
    private readonly treeElements;
    private treeOutline;
    private matchesExpandedCount;
    constructor(searchConfig: SearchConfig);
    addSearchResult(searchResult: SearchResult): void;
    showAllMatches(): void;
    collapseAllResults(): void;
    private addTreeElement;
    wasShown(): void;
}
export declare const matchesExpandedByDefault = 200;
export declare const matchesShownAtOnce = 20;
export declare class SearchResultsTreeElement extends UI.TreeOutline.TreeElement {
    private searchConfig;
    private searchResult;
    private initialized;
    toggleOnClick: boolean;
    constructor(searchConfig: SearchConfig, searchResult: SearchResult);
    onexpand(): void;
    showAllMatches(): void;
    private updateMatchesUI;
    onattach(): void;
    private updateSearchMatches;
    private appendSearchMatches;
    private appendShowMoreMatchesElement;
    private createContentSpan;
    private regexMatchRanges;
    private showMoreMatchesElementSelected;
}

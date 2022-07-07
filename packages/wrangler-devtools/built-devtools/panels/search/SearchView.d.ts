import * as UI from '../../ui/legacy/legacy.js';
import type { SearchScope } from './SearchConfig.js';
export declare class SearchView extends UI.Widget.VBox {
    private focusOnShow;
    private isIndexing;
    private searchId;
    private searchMatchesCount;
    private searchResultsCount;
    private nonEmptySearchResultsCount;
    private searchingView;
    private notFoundView;
    private searchConfig;
    private pendingSearchConfig;
    private searchResultsPane;
    private progressIndicator;
    private visiblePane;
    private readonly searchPanelElement;
    private readonly searchResultsElement;
    private search;
    private matchCaseButton;
    private readonly regexButton;
    private searchMessageElement;
    private readonly searchProgressPlaceholderElement;
    private searchResultsMessageElement;
    private readonly advancedSearchConfig;
    private searchScope;
    constructor(settingKey: string);
    private static appendToolbarToggle;
    private buildSearchConfig;
    toggle(queryCandidate: string, searchImmediately?: boolean): Promise<void>;
    createScope(): SearchScope;
    private initScope;
    wasShown(): void;
    private onIndexingFinished;
    private startIndexing;
    private onSearchInputClear;
    private onSearchResult;
    private onSearchFinished;
    private startSearch;
    private innerStartSearch;
    private resetSearch;
    private clearSearchMessage;
    private stopSearch;
    private searchStarted;
    private indexingFinished;
    private updateSearchResultsMessage;
    private showPane;
    private resetCounters;
    private nothingFound;
    private addSearchResult;
    private searchFinished;
    focus(): void;
    willHide(): void;
    private onKeyDown;
    /**
     * Handles keydown event on panel itself for handling expand/collapse all shortcut
     *
     * We use `event.code` instead of `event.key` here to check whether the shortcut is triggered.
     * The reason is, `event.key` is dependent on the modification keys, locale and keyboard layout.
     * Usually it is useful when we care about the character that needs to be printed.
     *
     * However, our aim in here is to assign a shortcut to the physical key combination on the keyboard
     * not on the character that the key combination prints.
     *
     * For example, `Cmd + [` shortcut in global shortcuts map to focusing on previous panel.
     * In Turkish - Q keyboard layout, the key combination that triggers the shortcut prints `ğ`
     * character. Whereas in Turkish - Q Legacy keyboard layout, the shortcut that triggers focusing
     * on previous panel prints `[` character. So, if we use `event.key` and check
     * whether it is `[`, we break the shortcut in Turkish - Q keyboard layout.
     *
     * @param event KeyboardEvent
     */
    private onKeyDownOnPanel;
    private save;
    private load;
    private onAction;
}

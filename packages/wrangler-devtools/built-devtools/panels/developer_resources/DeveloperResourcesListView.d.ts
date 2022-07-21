import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare class DeveloperResourcesListView extends UI.Widget.VBox {
    private readonly nodeForItem;
    private readonly isVisibleFilter;
    private highlightRegExp;
    private dataGrid;
    constructor(isVisibleFilter: (arg0: SDK.PageResourceLoader.PageResource) => boolean);
    private populateContextMenu;
    update(items: Iterable<SDK.PageResourceLoader.PageResource>): void;
    reset(): void;
    updateFilterAndHighlight(highlightRegExp: RegExp | null): void;
    private sortingChanged;
    wasShown(): void;
}

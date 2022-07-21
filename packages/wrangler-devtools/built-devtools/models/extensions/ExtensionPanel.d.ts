import type * as Platform from '../../core/platform/platform.js';
import * as UI from '../../ui/legacy/legacy.js';
import type { ExtensionServer } from './ExtensionServer.js';
export declare class ExtensionPanel extends UI.Panel.Panel implements UI.SearchableView.Searchable {
    private readonly server;
    private readonly id;
    private readonly panelToolbar;
    private readonly searchableViewInternal;
    constructor(server: ExtensionServer, panelName: string, id: string, pageURL: string);
    addToolbarItem(item: UI.Toolbar.ToolbarItem): void;
    searchCanceled(): void;
    searchableView(): UI.SearchableView.SearchableView;
    performSearch(searchConfig: UI.SearchableView.SearchConfig, _shouldJump: boolean, _jumpBackwards?: boolean): void;
    jumpToNextSearchResult(): void;
    jumpToPreviousSearchResult(): void;
    supportsCaseSensitiveSearch(): boolean;
    supportsRegexSearch(): boolean;
}
export declare class ExtensionButton {
    private readonly id;
    private readonly toolbarButtonInternal;
    constructor(server: ExtensionServer, id: string, iconURL: string, tooltip?: string, disabled?: boolean);
    update(iconURL?: string, tooltip?: string, disabled?: boolean): void;
    toolbarButton(): UI.Toolbar.ToolbarButton;
}
export declare class ExtensionSidebarPane extends UI.View.SimpleView {
    private readonly panelNameInternal;
    private server;
    private idInternal;
    private extensionView?;
    private objectPropertiesView?;
    constructor(server: ExtensionServer, panelName: string, title: Platform.UIString.LocalizedString, id: string);
    id(): string;
    panelName(): string;
    setObject(object: Object, title: string | undefined, callback: (arg0?: (string | null) | undefined) => void): void;
    setExpression(expression: string, title: string | undefined, evaluateOptions: Object | undefined, securityOrigin: string, callback: (arg0?: (string | null) | undefined) => void): void;
    setPage(url: Platform.DevToolsPath.UrlString): void;
    setHeight(height: string): void;
    private onEvaluate;
    private createObjectPropertiesView;
    private setObjectInternal;
}

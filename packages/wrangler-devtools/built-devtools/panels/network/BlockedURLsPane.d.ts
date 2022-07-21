import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export declare let blockedURLsPaneInstance: BlockedURLsPane | null;
export declare class BlockedURLsPane extends UI.Widget.VBox implements UI.ListWidget.Delegate<SDK.NetworkManager.BlockedPattern> {
    private manager;
    private readonly toolbar;
    private readonly enabledCheckbox;
    private readonly list;
    private editor;
    private blockedCountForUrl;
    private readonly updateThrottler;
    constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): BlockedURLsPane;
    private createEmptyPlaceholder;
    static reset(): void;
    private addButtonClicked;
    renderItem(pattern: SDK.NetworkManager.BlockedPattern, editable: boolean): Element;
    private togglePattern;
    private toggleEnabled;
    removeItemRequested(pattern: SDK.NetworkManager.BlockedPattern, index: number): void;
    beginEdit(pattern: SDK.NetworkManager.BlockedPattern): UI.ListWidget.Editor<SDK.NetworkManager.BlockedPattern>;
    commitEdit(item: SDK.NetworkManager.BlockedPattern, editor: UI.ListWidget.Editor<SDK.NetworkManager.BlockedPattern>, isNew: boolean): void;
    private createEditor;
    private removeAll;
    private update;
    private blockedRequestsCount;
    private matches;
    reset(): void;
    private onRequestFinished;
    wasShown(): void;
}

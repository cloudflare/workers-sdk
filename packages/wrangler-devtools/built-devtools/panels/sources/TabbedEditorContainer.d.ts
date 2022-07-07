import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as TextUtils from '../../models/text_utils/text_utils.js';
import * as Workspace from '../../models/workspace/workspace.js';
import * as UI from '../../ui/legacy/legacy.js';
import { UISourceCodeFrame } from './UISourceCodeFrame.js';
export interface TabbedEditorContainerDelegate {
    viewForFile(uiSourceCode: Workspace.UISourceCode.UISourceCode): UI.Widget.Widget;
    recycleUISourceCodeFrame(sourceFrame: UISourceCodeFrame, uiSourceCode: Workspace.UISourceCode.UISourceCode): void;
}
export declare class TabbedEditorContainer extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    private readonly delegate;
    private readonly tabbedPane;
    private tabIds;
    private readonly files;
    private readonly previouslyViewedFilesSetting;
    private readonly history;
    private readonly uriToUISourceCode;
    private readonly idToUISourceCode;
    private currentFileInternal;
    private currentView;
    private scrollTimer?;
    constructor(delegate: TabbedEditorContainerDelegate, setting: Common.Settings.Setting<SerializedHistoryItem[]>, placeholderElement: Element, focusedPlaceholderElement?: Element);
    private onBindingCreated;
    private onBindingRemoved;
    get view(): UI.Widget.Widget;
    get visibleView(): UI.Widget.Widget | null;
    fileViews(): UI.Widget.Widget[];
    leftToolbar(): UI.Toolbar.Toolbar;
    rightToolbar(): UI.Toolbar.Toolbar;
    show(parentElement: Element): void;
    showFile(uiSourceCode: Workspace.UISourceCode.UISourceCode): void;
    closeFile(uiSourceCode: Workspace.UISourceCode.UISourceCode): void;
    closeAllFiles(): void;
    historyUISourceCodes(): Workspace.UISourceCode.UISourceCode[];
    private addViewListeners;
    private removeViewListeners;
    private onScrollChanged;
    private onEditorUpdate;
    private innerShowFile;
    private titleForFile;
    private maybeCloseTab;
    closeTabs(ids: string[], forceCloseDirtyTabs?: boolean): void;
    onContextMenu(tabId: string, contextMenu: UI.ContextMenu.ContextMenu): void;
    private canonicalUISourceCode;
    addUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): void;
    removeUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): void;
    removeUISourceCodes(uiSourceCodes: Workspace.UISourceCode.UISourceCode[]): void;
    private editorClosedByUserAction;
    private editorSelectedByUserAction;
    private updateHistory;
    private tooltipForFile;
    private appendFileTab;
    private addLoadErrorIcon;
    private restoreEditorProperties;
    private tabClosed;
    private tabSelected;
    private addUISourceCodeListeners;
    private removeUISourceCodeListeners;
    private updateFileTitle;
    private uiSourceCodeTitleChanged;
    private uiSourceCodeWorkingCopyChanged;
    private uiSourceCodeWorkingCopyCommitted;
    private generateTabId;
    currentFile(): Workspace.UISourceCode.UISourceCode | null;
}
export declare enum Events {
    EditorSelected = "EditorSelected",
    EditorClosed = "EditorClosed"
}
export interface EditorSelectedEvent {
    currentFile: Workspace.UISourceCode.UISourceCode;
    currentView: UI.Widget.Widget | null;
    previousView: UI.Widget.Widget | null;
    userGesture: boolean | undefined;
}
export declare type EventTypes = {
    [Events.EditorSelected]: EditorSelectedEvent;
    [Events.EditorClosed]: Workspace.UISourceCode.UISourceCode;
};
export declare let tabId: number;
export declare const maximalPreviouslyViewedFilesCount = 30;
interface SerializedHistoryItem {
    url: Platform.DevToolsPath.UrlString;
    selectionRange?: TextUtils.TextRange.SerializedTextRange;
    scrollLineNumber?: number;
}
export declare class HistoryItem {
    url: Platform.DevToolsPath.UrlString;
    private isSerializable;
    selectionRange: TextUtils.TextRange.TextRange | undefined;
    scrollLineNumber: number | undefined;
    constructor(url: Platform.DevToolsPath.UrlString, selectionRange?: TextUtils.TextRange.TextRange, scrollLineNumber?: number);
    static fromObject(serializedHistoryItem: SerializedHistoryItem): HistoryItem;
    serializeToObject(): SerializedHistoryItem | null;
    static readonly serializableUrlLengthLimit = 4096;
}
export declare class History {
    private items;
    private itemsIndex;
    constructor(items: HistoryItem[]);
    static fromObject(serializedHistory: SerializedHistoryItem[]): History;
    index(url: Platform.DevToolsPath.UrlString): number;
    private rebuildItemIndex;
    selectionRange(url: Platform.DevToolsPath.UrlString): TextUtils.TextRange.TextRange | undefined;
    updateSelectionRange(url: Platform.DevToolsPath.UrlString, selectionRange?: TextUtils.TextRange.TextRange): void;
    scrollLineNumber(url: Platform.DevToolsPath.UrlString): number | undefined;
    updateScrollLineNumber(url: Platform.DevToolsPath.UrlString, scrollLineNumber: number): void;
    update(urls: Platform.DevToolsPath.UrlString[]): void;
    remove(url: Platform.DevToolsPath.UrlString): void;
    save(setting: Common.Settings.Setting<SerializedHistoryItem[]>): void;
    private serializeToObject;
    urls(): Platform.DevToolsPath.UrlString[];
}
export declare class EditorContainerTabDelegate implements UI.TabbedPane.TabbedPaneTabDelegate {
    private readonly editorContainer;
    constructor(editorContainer: TabbedEditorContainer);
    closeTabs(_tabbedPane: UI.TabbedPane.TabbedPane, ids: string[]): void;
    onContextMenu(tabId: string, contextMenu: UI.ContextMenu.ContextMenu): void;
}
export {};

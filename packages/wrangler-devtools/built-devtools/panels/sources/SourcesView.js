// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as Persistence from '../../models/persistence/persistence.js';
import * as Workspace from '../../models/workspace/workspace.js';
import * as QuickOpen from '../../ui/legacy/components/quick_open/quick_open.js';
import * as SourceFrame from '../../ui/legacy/components/source_frame/source_frame.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as Components from './components/components.js';
import { EditingLocationHistoryManager } from './EditingLocationHistoryManager.js';
import sourcesViewStyles from './sourcesView.css.js';
import { Events as TabbedEditorContainerEvents, TabbedEditorContainer } from './TabbedEditorContainer.js';
import { Events as UISourceCodeFrameEvents, UISourceCodeFrame } from './UISourceCodeFrame.js';
const UIStrings = {
    /**
    *@description Text to open a file
    */
    openFile: 'Open file',
    /**
    *@description Text to run commands
    */
    runCommand: 'Run command',
    /**
    *@description Text in Sources View of the Sources panel
    */
    dropInAFolderToAddToWorkspace: 'Drop in a folder to add to workspace',
    /**
    *@description Accessible label for Sources placeholder view actions list
    */
    sourceViewActions: 'Source View Actions',
};
const str_ = i18n.i18n.registerUIStrings('panels/sources/SourcesView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class SourcesView extends Common.ObjectWrapper.eventMixin(UI.Widget.VBox) {
    placeholderOptionArray;
    selectedIndex;
    searchableViewInternal;
    sourceViewByUISourceCode;
    editorContainer;
    historyManager;
    toolbarContainerElementInternal;
    scriptViewToolbar;
    bottomToolbarInternal;
    toolbarChangedListener;
    shortcuts;
    focusedPlaceholderElement;
    searchView;
    searchConfig;
    constructor() {
        super();
        this.element.id = 'sources-panel-sources-view';
        this.setMinimumAndPreferredSizes(250, 52, 250, 100);
        this.placeholderOptionArray = [];
        this.selectedIndex = 0;
        const workspace = Workspace.Workspace.WorkspaceImpl.instance();
        this.searchableViewInternal = new UI.SearchableView.SearchableView(this, this, 'sourcesViewSearchConfig');
        this.searchableViewInternal.setMinimalSearchQuerySize(0);
        this.searchableViewInternal.show(this.element);
        this.sourceViewByUISourceCode = new Map();
        this.editorContainer = new TabbedEditorContainer(this, Common.Settings.Settings.instance().createLocalSetting('previouslyViewedFiles', []), this.placeholderElement(), this.focusedPlaceholderElement);
        this.editorContainer.show(this.searchableViewInternal.element);
        this.editorContainer.addEventListener(TabbedEditorContainerEvents.EditorSelected, this.editorSelected, this);
        this.editorContainer.addEventListener(TabbedEditorContainerEvents.EditorClosed, this.editorClosed, this);
        this.historyManager = new EditingLocationHistoryManager(this);
        this.toolbarContainerElementInternal = this.element.createChild('div', 'sources-toolbar');
        if (!Root.Runtime.experiments.isEnabled('sourcesPrettyPrint')) {
            const toolbarEditorActions = new UI.Toolbar.Toolbar('', this.toolbarContainerElementInternal);
            for (const action of getRegisteredEditorActions()) {
                toolbarEditorActions.appendToolbarItem(action.getOrCreateButton(this));
            }
        }
        this.scriptViewToolbar = new UI.Toolbar.Toolbar('', this.toolbarContainerElementInternal);
        this.scriptViewToolbar.element.style.flex = 'auto';
        this.bottomToolbarInternal = new UI.Toolbar.Toolbar('', this.toolbarContainerElementInternal);
        this.toolbarChangedListener = null;
        UI.UIUtils.startBatchUpdate();
        workspace.uiSourceCodes().forEach(this.addUISourceCode.bind(this));
        UI.UIUtils.endBatchUpdate();
        workspace.addEventListener(Workspace.Workspace.Events.UISourceCodeAdded, this.uiSourceCodeAdded, this);
        workspace.addEventListener(Workspace.Workspace.Events.UISourceCodeRemoved, this.uiSourceCodeRemoved, this);
        workspace.addEventListener(Workspace.Workspace.Events.ProjectRemoved, this.projectRemoved.bind(this), this);
        function handleBeforeUnload(event) {
            if (event.returnValue) {
                return;
            }
            const unsavedSourceCodes = [];
            const projects = Workspace.Workspace.WorkspaceImpl.instance().projectsForType(Workspace.Workspace.projectTypes.FileSystem);
            for (const project of projects) {
                unsavedSourceCodes.push(...project.uiSourceCodes().filter(sourceCode => sourceCode.isDirty()));
            }
            if (!unsavedSourceCodes.length) {
                return;
            }
            event.returnValue = true;
            void UI.ViewManager.ViewManager.instance().showView('sources');
            for (const sourceCode of unsavedSourceCodes) {
                void Common.Revealer.reveal(sourceCode);
            }
        }
        if (!window.opener) {
            window.addEventListener('beforeunload', handleBeforeUnload, true);
        }
        this.shortcuts = new Map();
        this.element.addEventListener('keydown', this.handleKeyDown.bind(this), false);
    }
    placeholderElement() {
        this.placeholderOptionArray = [];
        const shortcuts = [
            { actionId: 'quickOpen.show', description: i18nString(UIStrings.openFile) },
            { actionId: 'commandMenu.show', description: i18nString(UIStrings.runCommand) },
            { actionId: 'sources.add-folder-to-workspace', description: i18nString(UIStrings.dropInAFolderToAddToWorkspace) },
        ];
        const element = document.createElement('div');
        const list = element.createChild('div', 'tabbed-pane-placeholder');
        list.addEventListener('keydown', this.placeholderOnKeyDown.bind(this), false);
        UI.ARIAUtils.markAsList(list);
        UI.ARIAUtils.setAccessibleName(list, i18nString(UIStrings.sourceViewActions));
        for (let i = 0; i < shortcuts.length; i++) {
            const shortcut = shortcuts[i];
            const shortcutKeyText = UI.ShortcutRegistry.ShortcutRegistry.instance().shortcutTitleForAction(shortcut.actionId);
            const listItemElement = list.createChild('div');
            UI.ARIAUtils.markAsListitem(listItemElement);
            const row = listItemElement.createChild('div', 'tabbed-pane-placeholder-row');
            row.tabIndex = -1;
            UI.ARIAUtils.markAsButton(row);
            if (shortcutKeyText) {
                row.createChild('div', 'tabbed-pane-placeholder-key').textContent = shortcutKeyText;
                row.createChild('div', 'tabbed-pane-placeholder-value').textContent = shortcut.description;
            }
            else {
                row.createChild('div', 'tabbed-pane-no-shortcut').textContent = shortcut.description;
            }
            const action = UI.ActionRegistry.ActionRegistry.instance().action(shortcut.actionId);
            if (action) {
                this.placeholderOptionArray.push({
                    element: row,
                    handler() {
                        void action.execute();
                    },
                });
            }
        }
        element.appendChild(UI.XLink.XLink.create('https://developer.chrome.com/docs/devtools/workspaces/', 'Learn more about Workspaces'));
        return element;
    }
    placeholderOnKeyDown(event) {
        const keyboardEvent = event;
        if (isEnterOrSpaceKey(keyboardEvent)) {
            this.placeholderOptionArray[this.selectedIndex].handler();
            return;
        }
        let offset = 0;
        if (keyboardEvent.key === 'ArrowDown') {
            offset = 1;
        }
        else if (keyboardEvent.key === 'ArrowUp') {
            offset = -1;
        }
        const newIndex = Math.max(Math.min(this.placeholderOptionArray.length - 1, this.selectedIndex + offset), 0);
        const newElement = this.placeholderOptionArray[newIndex].element;
        const oldElement = this.placeholderOptionArray[this.selectedIndex].element;
        if (newElement !== oldElement) {
            oldElement.tabIndex = -1;
            newElement.tabIndex = 0;
            UI.ARIAUtils.setSelected(oldElement, false);
            UI.ARIAUtils.setSelected(newElement, true);
            this.selectedIndex = newIndex;
            newElement.focus();
        }
    }
    static defaultUISourceCodeScores() {
        const defaultScores = new Map();
        const sourcesView = UI.Context.Context.instance().flavor(SourcesView);
        if (sourcesView) {
            const uiSourceCodes = sourcesView.editorContainer.historyUISourceCodes();
            for (let i = 1; i < uiSourceCodes.length; ++i) // Skip current element
             {
                defaultScores.set(uiSourceCodes[i], uiSourceCodes.length - i);
            }
        }
        return defaultScores;
    }
    leftToolbar() {
        return this.editorContainer.leftToolbar();
    }
    rightToolbar() {
        return this.editorContainer.rightToolbar();
    }
    bottomToolbar() {
        return this.bottomToolbarInternal;
    }
    registerShortcuts(keys, handler) {
        for (let i = 0; i < keys.length; ++i) {
            this.shortcuts.set(keys[i].key, handler);
        }
    }
    handleKeyDown(event) {
        const shortcutKey = UI.KeyboardShortcut.KeyboardShortcut.makeKeyFromEvent(event);
        const handler = this.shortcuts.get(shortcutKey);
        if (handler && handler()) {
            event.consume(true);
        }
    }
    wasShown() {
        super.wasShown();
        this.registerCSSFiles([sourcesViewStyles]);
        UI.Context.Context.instance().setFlavor(SourcesView, this);
    }
    willHide() {
        UI.Context.Context.instance().setFlavor(SourcesView, null);
        super.willHide();
    }
    toolbarContainerElement() {
        return this.toolbarContainerElementInternal;
    }
    searchableView() {
        return this.searchableViewInternal;
    }
    visibleView() {
        return this.editorContainer.visibleView;
    }
    currentSourceFrame() {
        const view = this.visibleView();
        if (!(view instanceof UISourceCodeFrame)) {
            return null;
        }
        return view;
    }
    currentUISourceCode() {
        return this.editorContainer.currentFile();
    }
    onCloseEditorTab() {
        const uiSourceCode = this.editorContainer.currentFile();
        if (!uiSourceCode) {
            return false;
        }
        this.editorContainer.closeFile(uiSourceCode);
        return true;
    }
    onJumpToPreviousLocation() {
        this.historyManager.rollback();
    }
    onJumpToNextLocation() {
        this.historyManager.rollover();
    }
    uiSourceCodeAdded(event) {
        const uiSourceCode = event.data;
        this.addUISourceCode(uiSourceCode);
    }
    addUISourceCode(uiSourceCode) {
        if (uiSourceCode.project().isServiceProject()) {
            return;
        }
        if (uiSourceCode.project().type() === Workspace.Workspace.projectTypes.FileSystem &&
            Persistence.FileSystemWorkspaceBinding.FileSystemWorkspaceBinding.fileSystemType(uiSourceCode.project()) ===
                'overrides') {
            return;
        }
        this.editorContainer.addUISourceCode(uiSourceCode);
    }
    uiSourceCodeRemoved(event) {
        const uiSourceCode = event.data;
        this.removeUISourceCodes([uiSourceCode]);
    }
    removeUISourceCodes(uiSourceCodes) {
        this.editorContainer.removeUISourceCodes(uiSourceCodes);
        for (let i = 0; i < uiSourceCodes.length; ++i) {
            this.removeSourceFrame(uiSourceCodes[i]);
            this.historyManager.removeHistoryForSourceCode(uiSourceCodes[i]);
        }
    }
    projectRemoved(event) {
        const project = event.data;
        const uiSourceCodes = project.uiSourceCodes();
        this.removeUISourceCodes(uiSourceCodes);
    }
    updateScriptViewToolbarItems() {
        const view = this.visibleView();
        if (view instanceof UI.View.SimpleView) {
            void view.toolbarItems().then(items => {
                this.scriptViewToolbar.removeToolbarItems();
                items.map(item => this.scriptViewToolbar.appendToolbarItem(item));
            });
        }
    }
    showSourceLocation(uiSourceCode, location, omitFocus, omitHighlight) {
        const currentFrame = this.currentSourceFrame();
        if (currentFrame) {
            this.historyManager.updateCurrentState(currentFrame.uiSourceCode(), currentFrame.textEditor.state.selection.main.head);
        }
        this.editorContainer.showFile(uiSourceCode);
        const currentSourceFrame = this.currentSourceFrame();
        if (currentSourceFrame && location) {
            currentSourceFrame.revealPosition(location, !omitHighlight);
        }
        const visibleView = this.visibleView();
        if (!omitFocus && visibleView) {
            visibleView.focus();
        }
    }
    createSourceView(uiSourceCode) {
        let sourceFrame;
        let sourceView;
        const contentType = uiSourceCode.contentType();
        if (contentType === Common.ResourceType.resourceTypes.Image) {
            sourceView = new SourceFrame.ImageView.ImageView(uiSourceCode.mimeType(), uiSourceCode);
        }
        else if (contentType === Common.ResourceType.resourceTypes.Font) {
            sourceView = new SourceFrame.FontView.FontView(uiSourceCode.mimeType(), uiSourceCode);
        }
        else if (uiSourceCode.name() === HEADER_OVERRIDES_FILENAME &&
            Root.Runtime.experiments.isEnabled(Root.Runtime.ExperimentName.HEADER_OVERRIDES)) {
            sourceView = new Components.HeadersView.HeadersView(uiSourceCode);
        }
        else {
            sourceFrame = new UISourceCodeFrame(uiSourceCode);
        }
        if (sourceFrame) {
            this.historyManager.trackSourceFrameCursorJumps(sourceFrame);
        }
        uiSourceCode.addEventListener(Workspace.UISourceCode.Events.TitleChanged, this.#uiSourceCodeTitleChanged, this);
        const widget = (sourceFrame || sourceView);
        this.sourceViewByUISourceCode.set(uiSourceCode, widget);
        return widget;
    }
    #sourceViewTypeForWidget(widget) {
        if (widget instanceof SourceFrame.ImageView.ImageView) {
            return SourceViewType.ImageView;
        }
        if (widget instanceof SourceFrame.FontView.FontView) {
            return SourceViewType.FontView;
        }
        if (widget instanceof Components.HeadersView.HeadersView) {
            return SourceViewType.HeadersView;
        }
        return SourceViewType.SourceView;
    }
    #sourceViewTypeForUISourceCode(uiSourceCode) {
        if (uiSourceCode.name() === HEADER_OVERRIDES_FILENAME &&
            Root.Runtime.experiments.isEnabled(Root.Runtime.ExperimentName.HEADER_OVERRIDES)) {
            return SourceViewType.HeadersView;
        }
        const contentType = uiSourceCode.contentType();
        switch (contentType) {
            case Common.ResourceType.resourceTypes.Image:
                return SourceViewType.ImageView;
            case Common.ResourceType.resourceTypes.Font:
                return SourceViewType.FontView;
            default:
                return SourceViewType.SourceView;
        }
    }
    #uiSourceCodeTitleChanged(event) {
        const uiSourceCode = event.data;
        const widget = this.sourceViewByUISourceCode.get(uiSourceCode);
        if (widget) {
            if (this.#sourceViewTypeForWidget(widget) !== this.#sourceViewTypeForUISourceCode(uiSourceCode)) {
                // Remove the exisiting editor tab and create a new one of the correct type.
                this.removeUISourceCodes([uiSourceCode]);
                this.showSourceLocation(uiSourceCode);
            }
        }
    }
    getSourceView(uiSourceCode) {
        return this.sourceViewByUISourceCode.get(uiSourceCode);
    }
    getOrCreateSourceView(uiSourceCode) {
        return this.sourceViewByUISourceCode.get(uiSourceCode) || this.createSourceView(uiSourceCode);
    }
    recycleUISourceCodeFrame(sourceFrame, uiSourceCode) {
        sourceFrame.uiSourceCode().removeEventListener(Workspace.UISourceCode.Events.TitleChanged, this.#uiSourceCodeTitleChanged, this);
        this.sourceViewByUISourceCode.delete(sourceFrame.uiSourceCode());
        sourceFrame.setUISourceCode(uiSourceCode);
        this.sourceViewByUISourceCode.set(uiSourceCode, sourceFrame);
        uiSourceCode.addEventListener(Workspace.UISourceCode.Events.TitleChanged, this.#uiSourceCodeTitleChanged, this);
    }
    viewForFile(uiSourceCode) {
        return this.getOrCreateSourceView(uiSourceCode);
    }
    removeSourceFrame(uiSourceCode) {
        const sourceView = this.sourceViewByUISourceCode.get(uiSourceCode);
        this.sourceViewByUISourceCode.delete(uiSourceCode);
        if (sourceView && sourceView instanceof UISourceCodeFrame) {
            sourceView.dispose();
        }
        uiSourceCode.removeEventListener(Workspace.UISourceCode.Events.TitleChanged, this.#uiSourceCodeTitleChanged, this);
    }
    editorClosed(event) {
        const uiSourceCode = event.data;
        this.historyManager.removeHistoryForSourceCode(uiSourceCode);
        let wasSelected = false;
        if (!this.editorContainer.currentFile()) {
            wasSelected = true;
        }
        // SourcesNavigator does not need to update on EditorClosed.
        this.removeToolbarChangedListener();
        this.updateScriptViewToolbarItems();
        this.searchableViewInternal.resetSearch();
        const data = {
            uiSourceCode: uiSourceCode,
            wasSelected: wasSelected,
        };
        this.dispatchEventToListeners(Events.EditorClosed, data);
    }
    editorSelected(event) {
        const previousSourceFrame = event.data.previousView instanceof UISourceCodeFrame ? event.data.previousView : null;
        if (previousSourceFrame) {
            previousSourceFrame.setSearchableView(null);
        }
        const currentSourceFrame = event.data.currentView instanceof UISourceCodeFrame ? event.data.currentView : null;
        if (currentSourceFrame) {
            currentSourceFrame.setSearchableView(this.searchableViewInternal);
        }
        this.searchableViewInternal.setReplaceable(Boolean(currentSourceFrame?.canEditSource()));
        this.searchableViewInternal.refreshSearch();
        this.updateToolbarChangedListener();
        this.updateScriptViewToolbarItems();
        const currentFile = this.editorContainer.currentFile();
        if (currentFile) {
            this.dispatchEventToListeners(Events.EditorSelected, currentFile);
        }
    }
    removeToolbarChangedListener() {
        if (this.toolbarChangedListener) {
            Common.EventTarget.removeEventListeners([this.toolbarChangedListener]);
        }
        this.toolbarChangedListener = null;
    }
    updateToolbarChangedListener() {
        this.removeToolbarChangedListener();
        const sourceFrame = this.currentSourceFrame();
        if (!sourceFrame) {
            return;
        }
        this.toolbarChangedListener = sourceFrame.addEventListener(UISourceCodeFrameEvents.ToolbarItemsChanged, this.updateScriptViewToolbarItems, this);
    }
    searchCanceled() {
        if (this.searchView) {
            this.searchView.searchCanceled();
        }
        delete this.searchView;
        delete this.searchConfig;
    }
    performSearch(searchConfig, shouldJump, jumpBackwards) {
        const sourceFrame = this.currentSourceFrame();
        if (!sourceFrame) {
            return;
        }
        this.searchView = sourceFrame;
        this.searchConfig = searchConfig;
        this.searchView.performSearch(this.searchConfig, shouldJump, jumpBackwards);
    }
    jumpToNextSearchResult() {
        if (!this.searchView) {
            return;
        }
        if (this.searchConfig && this.searchView !== this.currentSourceFrame()) {
            this.performSearch(this.searchConfig, true);
            return;
        }
        this.searchView.jumpToNextSearchResult();
    }
    jumpToPreviousSearchResult() {
        if (!this.searchView) {
            return;
        }
        if (this.searchConfig && this.searchView !== this.currentSourceFrame()) {
            this.performSearch(this.searchConfig, true);
            if (this.searchView) {
                this.searchView.jumpToLastSearchResult();
            }
            return;
        }
        this.searchView.jumpToPreviousSearchResult();
    }
    supportsCaseSensitiveSearch() {
        return true;
    }
    supportsRegexSearch() {
        return true;
    }
    replaceSelectionWith(searchConfig, replacement) {
        const sourceFrame = this.currentSourceFrame();
        if (!sourceFrame) {
            console.assert(Boolean(sourceFrame));
            return;
        }
        sourceFrame.replaceSelectionWith(searchConfig, replacement);
    }
    replaceAllWith(searchConfig, replacement) {
        const sourceFrame = this.currentSourceFrame();
        if (!sourceFrame) {
            console.assert(Boolean(sourceFrame));
            return;
        }
        sourceFrame.replaceAllWith(searchConfig, replacement);
    }
    showOutlineQuickOpen() {
        QuickOpen.QuickOpen.QuickOpenImpl.show('@');
    }
    showGoToLineQuickOpen() {
        if (this.editorContainer.currentFile()) {
            QuickOpen.QuickOpen.QuickOpenImpl.show(':');
        }
    }
    save() {
        this.saveSourceView(this.visibleView());
    }
    saveAll() {
        const sourceFrames = this.editorContainer.fileViews();
        sourceFrames.forEach(this.saveSourceView.bind(this));
    }
    saveSourceView(sourceView) {
        if (sourceView instanceof UISourceCodeFrame || sourceView instanceof Components.HeadersView.HeadersView) {
            sourceView.commitEditing();
        }
    }
    toggleBreakpointsActiveState(active) {
        this.editorContainer.view.element.classList.toggle('breakpoints-deactivated', !active);
    }
}
export // TODO(crbug.com/1167717): Make this a const enum again
 var Events;
(function (Events) {
    Events["EditorClosed"] = "EditorClosed";
    Events["EditorSelected"] = "EditorSelected";
})(Events || (Events = {}));
const registeredEditorActions = [];
export function registerEditorAction(editorAction) {
    registeredEditorActions.push(editorAction);
}
export function getRegisteredEditorActions() {
    return registeredEditorActions.map(editorAction => editorAction());
}
let switchFileActionDelegateInstance;
export class SwitchFileActionDelegate {
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!switchFileActionDelegateInstance || forceNew) {
            switchFileActionDelegateInstance = new SwitchFileActionDelegate();
        }
        return switchFileActionDelegateInstance;
    }
    static nextFile(currentUISourceCode) {
        function fileNamePrefix(name) {
            const lastDotIndex = name.lastIndexOf('.');
            const namePrefix = name.substr(0, lastDotIndex !== -1 ? lastDotIndex : name.length);
            return namePrefix.toLowerCase();
        }
        const uiSourceCodes = currentUISourceCode.project().uiSourceCodes();
        const candidates = [];
        const url = currentUISourceCode.parentURL();
        const name = currentUISourceCode.name();
        const namePrefix = fileNamePrefix(name);
        for (let i = 0; i < uiSourceCodes.length; ++i) {
            const uiSourceCode = uiSourceCodes[i];
            if (url !== uiSourceCode.parentURL()) {
                continue;
            }
            if (fileNamePrefix(uiSourceCode.name()) === namePrefix) {
                candidates.push(uiSourceCode.name());
            }
        }
        candidates.sort(Platform.StringUtilities.naturalOrderComparator);
        const index = Platform.NumberUtilities.mod(candidates.indexOf(name) + 1, candidates.length);
        const fullURL = Common.ParsedURL.ParsedURL.concatenate((url ? Common.ParsedURL.ParsedURL.concatenate(url, '/') : ''), candidates[index]);
        const nextUISourceCode = currentUISourceCode.project().uiSourceCodeForURL(fullURL);
        return nextUISourceCode !== currentUISourceCode ? nextUISourceCode : null;
    }
    handleAction(_context, _actionId) {
        const sourcesView = UI.Context.Context.instance().flavor(SourcesView);
        if (!sourcesView) {
            return false;
        }
        const currentUISourceCode = sourcesView.currentUISourceCode();
        if (!currentUISourceCode) {
            return false;
        }
        const nextUISourceCode = SwitchFileActionDelegate.nextFile(currentUISourceCode);
        if (!nextUISourceCode) {
            return false;
        }
        sourcesView.showSourceLocation(nextUISourceCode);
        return true;
    }
}
let actionDelegateInstance;
export class ActionDelegate {
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!actionDelegateInstance || forceNew) {
            actionDelegateInstance = new ActionDelegate();
        }
        return actionDelegateInstance;
    }
    handleAction(context, actionId) {
        const sourcesView = UI.Context.Context.instance().flavor(SourcesView);
        if (!sourcesView) {
            return false;
        }
        switch (actionId) {
            case 'sources.close-all':
                sourcesView.editorContainer.closeAllFiles();
                return true;
            case 'sources.jump-to-previous-location':
                sourcesView.onJumpToPreviousLocation();
                return true;
            case 'sources.jump-to-next-location':
                sourcesView.onJumpToNextLocation();
                return true;
            case 'sources.close-editor-tab':
                return sourcesView.onCloseEditorTab();
            case 'sources.go-to-line':
                sourcesView.showGoToLineQuickOpen();
                return true;
            case 'sources.go-to-member':
                sourcesView.showOutlineQuickOpen();
                return true;
            case 'sources.save':
                sourcesView.save();
                return true;
            case 'sources.save-all':
                sourcesView.saveAll();
                return true;
        }
        return false;
    }
}
const HEADER_OVERRIDES_FILENAME = '.headers';
// eslint-disable-next-line rulesdir/const_enum
var SourceViewType;
(function (SourceViewType) {
    SourceViewType["ImageView"] = "ImageView";
    SourceViewType["FontView"] = "FontView";
    SourceViewType["HeadersView"] = "HeadersView";
    SourceViewType["SourceView"] = "SourceView";
})(SourceViewType || (SourceViewType = {}));
//# sourceMappingURL=SourcesView.js.map
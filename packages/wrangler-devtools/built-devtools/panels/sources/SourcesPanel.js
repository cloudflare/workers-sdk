// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Bindings from '../../models/bindings/bindings.js';
import * as Extensions from '../../models/extensions/extensions.js';
import * as Workspace from '../../models/workspace/workspace.js';
import * as IconButton from '../../ui/components/icon_button/icon_button.js';
import * as ObjectUI from '../../ui/legacy/components/object_ui/object_ui.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as Snippets from '../snippets/snippets.js';
import { CallStackSidebarPane } from './CallStackSidebarPane.js';
import { DebuggerPausedMessage } from './DebuggerPausedMessage.js';
import sourcesPanelStyles from './sourcesPanel.css.js';
import { ContentScriptsNavigatorView, FilesNavigatorView, NetworkNavigatorView, OverridesNavigatorView, SnippetsNavigatorView, } from './SourcesNavigator.js';
import { Events, SourcesView } from './SourcesView.js';
import { ThreadsSidebarPane } from './ThreadsSidebarPane.js';
import { UISourceCodeFrame } from './UISourceCodeFrame.js';
const UIStrings = {
    /**
    *@description Text that appears when user drag and drop something (for example, a file) in Sources Panel of the Sources panel
    */
    dropWorkspaceFolderHere: 'Drop workspace folder here',
    /**
    *@description Text to show more options
    */
    moreOptions: 'More options',
    /**
    * @description Tooltip for the the navigator toggle in the Sources panel. Command to open/show the
    * sidebar containing the navigator tool.
    */
    showNavigator: 'Show navigator',
    /**
    * @description Tooltip for the the navigator toggle in the Sources panel. Command to close/hide
    * the sidebar containing the navigator tool.
    */
    hideNavigator: 'Hide navigator',
    /**
     * @description Screen reader announcement when the navigator sidebar is shown in the Sources panel.
     */
    navigatorShown: 'Navigator sidebar shown',
    /**
     * @description Screen reader announcement when the navigator sidebar is hidden in the Sources panel.
     */
    navigatorHidden: 'Navigator sidebar hidden',
    /**
     * @description Screen reader announcement when the navigator sidebar is shown in the Sources panel.
     */
    debuggerShown: 'Debugger sidebar shown',
    /**
     * @description Screen reader announcement when the navigator sidebar is hidden in the Sources panel.
     */
    debuggerHidden: 'Debugger sidebar hidden',
    /**
    * @description Tooltip for the the debugger toggle in the Sources panel. Command to open/show the
    * sidebar containing the debugger tool.
    */
    showDebugger: 'Show debugger',
    /**
    * @description Tooltip for the the debugger toggle in the Sources panel. Command to close/hide the
    * sidebar containing the debugger tool.
    */
    hideDebugger: 'Hide debugger',
    /**
    *@description Text in Sources Panel of the Sources panel
    */
    groupByFolder: 'Group by folder',
    /**
    *@description Text in Sources Panel of the Sources panel
    */
    groupByAuthored: 'Group by Authored/Deployed',
    /**
    *@description Text for pausing the debugger on exceptions
    */
    pauseOnExceptions: 'Pause on exceptions',
    /**
    *@description Text in Sources Panel of the Sources panel
    */
    dontPauseOnExceptions: 'Don\'t pause on exceptions',
    /**
    *@description Tooltip text that appears when hovering over the largeicon play button in the Sources Panel of the Sources panel
    */
    resumeWithAllPausesBlockedForMs: 'Resume with all pauses blocked for 500 ms',
    /**
    *@description Tooltip text that appears when hovering over the largeicon terminate execution button in the Sources Panel of the Sources panel
    */
    terminateCurrentJavascriptCall: 'Terminate current JavaScript call',
    /**
    *@description Text in Sources Panel of the Sources panel
    */
    pauseOnCaughtExceptions: 'Pause on caught exceptions',
    /**
    *@description A context menu item in the Sources Panel of the Sources panel
    */
    revealInSidebar: 'Reveal in sidebar',
    /**
    *@description A context menu item in the Sources Panel of the Sources panel when debugging JS code.
    * When clicked, the execution is resumed until it reaches the line specified by the right-click that
    * opened the context menu.
    */
    continueToHere: 'Continue to here',
    /**
    *@description A context menu item in the Console that stores selection as a temporary global variable
    *@example {string} PH1
    */
    storeSAsGlobalVariable: 'Store {PH1} as global variable',
    /**
    *@description A context menu item in the Console, Sources, and Network panel
    *@example {string} PH1
    */
    copyS: 'Copy {PH1}',
    /**
    *@description A context menu item for strings in the Console, Sources, and Network panel.
    * When clicked, the raw contents of the string is copied to the clipboard.
    */
    copyStringContents: 'Copy string contents',
    /**
    *@description A context menu item for strings in the Console, Sources, and Network panel.
    * When clicked, the string is copied to the clipboard as a valid JavaScript literal.
    */
    copyStringAsJSLiteral: 'Copy string as JavaScript literal',
    /**
    *@description A context menu item for strings in the Console, Sources, and Network panel.
    * When clicked, the string is copied to the clipboard as a valid JSON literal.
    */
    copyStringAsJSONLiteral: 'Copy string as JSON literal',
    /**
    *@description A context menu item in the Sources Panel of the Sources panel
    */
    showFunctionDefinition: 'Show function definition',
    /**
    *@description Text in Sources Panel of the Sources panel
    */
    openInSourcesPanel: 'Open in Sources panel',
};
const str_ = i18n.i18n.registerUIStrings('panels/sources/SourcesPanel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const primitiveRemoteObjectTypes = new Set(['number', 'boolean', 'bigint', 'undefined']);
let sourcesPanelInstance;
let wrapperViewInstance;
export class SourcesPanel extends UI.Panel.Panel {
    workspace;
    togglePauseAction;
    stepOverAction;
    stepIntoAction;
    stepOutAction;
    stepAction;
    toggleBreakpointsActiveAction;
    debugToolbar;
    debugToolbarDrawer;
    debuggerPausedMessage;
    splitWidget;
    editorView;
    navigatorTabbedLocation;
    sourcesViewInternal;
    toggleNavigatorSidebarButton;
    toggleDebuggerSidebarButton;
    threadsSidebarPane;
    watchSidebarPane;
    callstackPane;
    liveLocationPool;
    lastModificationTime;
    pausedInternal;
    switchToPausedTargetTimeout;
    ignoreExecutionLineEvents;
    executionLineLocation;
    pauseOnExceptionButton;
    sidebarPaneStack;
    tabbedLocationHeader;
    extensionSidebarPanesContainer;
    sidebarPaneView;
    constructor() {
        super('sources');
        new UI.DropTarget.DropTarget(this.element, [UI.DropTarget.Type.Folder], i18nString(UIStrings.dropWorkspaceFolderHere), this.handleDrop.bind(this));
        this.workspace = Workspace.Workspace.WorkspaceImpl.instance();
        this.togglePauseAction =
            UI.ActionRegistry.ActionRegistry.instance().action('debugger.toggle-pause');
        this.stepOverAction =
            UI.ActionRegistry.ActionRegistry.instance().action('debugger.step-over');
        this.stepIntoAction =
            UI.ActionRegistry.ActionRegistry.instance().action('debugger.step-into');
        this.stepOutAction =
            UI.ActionRegistry.ActionRegistry.instance().action('debugger.step-out');
        this.stepAction =
            UI.ActionRegistry.ActionRegistry.instance().action('debugger.step');
        this.toggleBreakpointsActiveAction =
            UI.ActionRegistry.ActionRegistry.instance().action('debugger.toggle-breakpoints-active');
        this.debugToolbar = this.createDebugToolbar();
        this.debugToolbarDrawer = this.createDebugToolbarDrawer();
        this.debuggerPausedMessage = new DebuggerPausedMessage();
        const initialDebugSidebarWidth = 225;
        this.splitWidget =
            new UI.SplitWidget.SplitWidget(true, true, 'sourcesPanelSplitViewState', initialDebugSidebarWidth);
        this.splitWidget.enableShowModeSaving();
        this.splitWidget.show(this.element);
        // Create scripts navigator
        const initialNavigatorWidth = 225;
        this.editorView =
            new UI.SplitWidget.SplitWidget(true, false, 'sourcesPanelNavigatorSplitViewState', initialNavigatorWidth);
        this.editorView.enableShowModeSaving();
        this.splitWidget.setMainWidget(this.editorView);
        // Create navigator tabbed pane with toolbar.
        this.navigatorTabbedLocation = UI.ViewManager.ViewManager.instance().createTabbedLocation(this.revealNavigatorSidebar.bind(this), 'navigator-view', true);
        const tabbedPane = this.navigatorTabbedLocation.tabbedPane();
        tabbedPane.setMinimumSize(100, 25);
        tabbedPane.element.classList.add('navigator-tabbed-pane');
        const navigatorMenuButton = new UI.Toolbar.ToolbarMenuButton(this.populateNavigatorMenu.bind(this), true);
        navigatorMenuButton.setTitle(i18nString(UIStrings.moreOptions));
        tabbedPane.rightToolbar().appendToolbarItem(navigatorMenuButton);
        if (UI.ViewManager.ViewManager.instance().hasViewsForLocation('run-view-sidebar')) {
            const navigatorSplitWidget = new UI.SplitWidget.SplitWidget(false, true, 'sourcePanelNavigatorSidebarSplitViewState');
            navigatorSplitWidget.setMainWidget(tabbedPane);
            const runViewTabbedPane = UI.ViewManager.ViewManager.instance()
                .createTabbedLocation(this.revealNavigatorSidebar.bind(this), 'run-view-sidebar')
                .tabbedPane();
            navigatorSplitWidget.setSidebarWidget(runViewTabbedPane);
            navigatorSplitWidget.installResizer(runViewTabbedPane.headerElement());
            this.editorView.setSidebarWidget(navigatorSplitWidget);
        }
        else {
            this.editorView.setSidebarWidget(tabbedPane);
        }
        this.sourcesViewInternal = new SourcesView();
        this.sourcesViewInternal.addEventListener(Events.EditorSelected, this.editorSelected.bind(this));
        this.toggleNavigatorSidebarButton = this.editorView.createShowHideSidebarButton(i18nString(UIStrings.showNavigator), i18nString(UIStrings.hideNavigator), i18nString(UIStrings.navigatorShown), i18nString(UIStrings.navigatorHidden));
        this.toggleDebuggerSidebarButton = this.splitWidget.createShowHideSidebarButton(i18nString(UIStrings.showDebugger), i18nString(UIStrings.hideDebugger), i18nString(UIStrings.debuggerShown), i18nString(UIStrings.debuggerHidden));
        this.editorView.setMainWidget(this.sourcesViewInternal);
        this.threadsSidebarPane = null;
        this.watchSidebarPane = UI.ViewManager.ViewManager.instance().view('sources.watch');
        this.callstackPane = CallStackSidebarPane.instance();
        Common.Settings.Settings.instance()
            .moduleSetting('sidebarPosition')
            .addChangeListener(this.updateSidebarPosition.bind(this));
        this.updateSidebarPosition();
        void this.updateDebuggerButtonsAndStatus();
        this.pauseOnExceptionEnabledChanged();
        Common.Settings.Settings.instance()
            .moduleSetting('pauseOnExceptionEnabled')
            .addChangeListener(this.pauseOnExceptionEnabledChanged, this);
        this.liveLocationPool = new Bindings.LiveLocation.LiveLocationPool();
        this.setTarget(UI.Context.Context.instance().flavor(SDK.Target.Target));
        Common.Settings.Settings.instance()
            .moduleSetting('breakpointsActive')
            .addChangeListener(this.breakpointsActiveStateChanged, this);
        UI.Context.Context.instance().addFlavorChangeListener(SDK.Target.Target, this.onCurrentTargetChanged, this);
        UI.Context.Context.instance().addFlavorChangeListener(SDK.DebuggerModel.CallFrame, this.callFrameChanged, this);
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.DebuggerModel.DebuggerModel, SDK.DebuggerModel.Events.DebuggerWasEnabled, this.debuggerWasEnabled, this);
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.DebuggerModel.DebuggerModel, SDK.DebuggerModel.Events.DebuggerPaused, this.debuggerPaused, this);
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.DebuggerModel.DebuggerModel, SDK.DebuggerModel.Events.DebuggerResumed, event => this.debuggerResumed(event.data));
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.DebuggerModel.DebuggerModel, SDK.DebuggerModel.Events.GlobalObjectCleared, event => this.debuggerResumed(event.data));
        Extensions.ExtensionServer.ExtensionServer.instance().addEventListener(Extensions.ExtensionServer.Events.SidebarPaneAdded, this.extensionSidebarPaneAdded, this);
        SDK.TargetManager.TargetManager.instance().observeTargets(this);
        this.lastModificationTime = -Infinity;
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!sourcesPanelInstance || forceNew) {
            sourcesPanelInstance = new SourcesPanel();
        }
        return sourcesPanelInstance;
    }
    static updateResizerAndSidebarButtons(panel) {
        panel.sourcesViewInternal.leftToolbar().removeToolbarItems();
        panel.sourcesViewInternal.rightToolbar().removeToolbarItems();
        panel.sourcesViewInternal.bottomToolbar().removeToolbarItems();
        const isInWrapper = WrapperView.isShowing() && !UI.InspectorView.InspectorView.instance().isDrawerMinimized();
        if (panel.splitWidget.isVertical() || isInWrapper) {
            panel.splitWidget.uninstallResizer(panel.sourcesViewInternal.toolbarContainerElement());
        }
        else {
            panel.splitWidget.installResizer(panel.sourcesViewInternal.toolbarContainerElement());
        }
        if (!isInWrapper) {
            panel.sourcesViewInternal.leftToolbar().appendToolbarItem(panel.toggleNavigatorSidebarButton);
            if (panel.splitWidget.isVertical()) {
                panel.sourcesViewInternal.rightToolbar().appendToolbarItem(panel.toggleDebuggerSidebarButton);
            }
            else {
                panel.sourcesViewInternal.bottomToolbar().appendToolbarItem(panel.toggleDebuggerSidebarButton);
            }
        }
    }
    targetAdded(_target) {
        this.showThreadsIfNeeded();
    }
    targetRemoved(_target) {
    }
    showThreadsIfNeeded() {
        if (ThreadsSidebarPane.shouldBeShown() && !this.threadsSidebarPane) {
            this.threadsSidebarPane = UI.ViewManager.ViewManager.instance().view('sources.threads');
            if (this.sidebarPaneStack && this.threadsSidebarPane) {
                void this.sidebarPaneStack.showView(this.threadsSidebarPane, this.splitWidget.isVertical() ? this.watchSidebarPane : this.callstackPane);
            }
        }
    }
    setTarget(target) {
        if (!target) {
            return;
        }
        const debuggerModel = target.model(SDK.DebuggerModel.DebuggerModel);
        if (!debuggerModel) {
            return;
        }
        if (debuggerModel.isPaused()) {
            this.showDebuggerPausedDetails(debuggerModel.debuggerPausedDetails());
        }
        else {
            this.pausedInternal = false;
            this.clearInterface();
            this.toggleDebuggerSidebarButton.setEnabled(true);
        }
    }
    onCurrentTargetChanged({ data: target }) {
        this.setTarget(target);
    }
    paused() {
        return this.pausedInternal || false;
    }
    wasShown() {
        UI.Context.Context.instance().setFlavor(SourcesPanel, this);
        this.registerCSSFiles([sourcesPanelStyles]);
        super.wasShown();
        const wrapper = WrapperView.instance();
        if (wrapper && wrapper.isShowing()) {
            UI.InspectorView.InspectorView.instance().setDrawerMinimized(true);
            SourcesPanel.updateResizerAndSidebarButtons(this);
        }
        this.editorView.setMainWidget(this.sourcesViewInternal);
    }
    willHide() {
        super.willHide();
        UI.Context.Context.instance().setFlavor(SourcesPanel, null);
        if (WrapperView.isShowing()) {
            WrapperView.instance().showViewInWrapper();
            UI.InspectorView.InspectorView.instance().setDrawerMinimized(false);
            SourcesPanel.updateResizerAndSidebarButtons(this);
        }
    }
    resolveLocation(locationName) {
        if (locationName === 'sources.sidebar-top' || locationName === 'sources.sidebar-bottom' ||
            locationName === 'sources.sidebar-tabs') {
            return this.sidebarPaneStack || null;
        }
        return this.navigatorTabbedLocation;
    }
    ensureSourcesViewVisible() {
        if (WrapperView.isShowing()) {
            return true;
        }
        if (!UI.InspectorView.InspectorView.instance().canSelectPanel('sources')) {
            return false;
        }
        void UI.ViewManager.ViewManager.instance().showView('sources');
        return true;
    }
    onResize() {
        if (Common.Settings.Settings.instance().moduleSetting('sidebarPosition').get() === 'auto') {
            this.element.window().requestAnimationFrame(this.updateSidebarPosition.bind(this));
        } // Do not force layout.
    }
    searchableView() {
        return this.sourcesViewInternal.searchableView();
    }
    toggleNavigatorSidebar() {
        this.editorView.toggleSidebar();
    }
    toggleDebuggerSidebar() {
        this.splitWidget.toggleSidebar();
    }
    debuggerPaused(event) {
        const debuggerModel = event.data;
        const details = debuggerModel.debuggerPausedDetails();
        if (!this.pausedInternal &&
            Common.Settings.Settings.instance().moduleSetting('autoFocusOnDebuggerPausedEnabled').get()) {
            void this.setAsCurrentPanel();
        }
        if (UI.Context.Context.instance().flavor(SDK.Target.Target) === debuggerModel.target()) {
            this.showDebuggerPausedDetails(details);
        }
        else if (!this.pausedInternal) {
            UI.Context.Context.instance().setFlavor(SDK.Target.Target, debuggerModel.target());
        }
    }
    showDebuggerPausedDetails(details) {
        this.pausedInternal = true;
        void this.updateDebuggerButtonsAndStatus();
        UI.Context.Context.instance().setFlavor(SDK.DebuggerModel.DebuggerPausedDetails, details);
        this.toggleDebuggerSidebarButton.setEnabled(false);
        this.revealDebuggerSidebar();
        window.focus();
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.bringToFront();
    }
    debuggerResumed(debuggerModel) {
        const target = debuggerModel.target();
        if (UI.Context.Context.instance().flavor(SDK.Target.Target) !== target) {
            return;
        }
        this.pausedInternal = false;
        this.clearInterface();
        this.toggleDebuggerSidebarButton.setEnabled(true);
        this.switchToPausedTargetTimeout = window.setTimeout(this.switchToPausedTarget.bind(this, debuggerModel), 500);
    }
    debuggerWasEnabled(event) {
        const debuggerModel = event.data;
        if (UI.Context.Context.instance().flavor(SDK.Target.Target) !== debuggerModel.target()) {
            return;
        }
        void this.updateDebuggerButtonsAndStatus();
    }
    get visibleView() {
        return this.sourcesViewInternal.visibleView();
    }
    showUISourceCode(uiSourceCode, lineNumber, columnNumber, omitFocus) {
        if (omitFocus) {
            const wrapperShowing = WrapperView.isShowing();
            if (!this.isShowing() && !wrapperShowing) {
                return;
            }
        }
        else {
            this.showEditor();
        }
        this.sourcesViewInternal.showSourceLocation(uiSourceCode, lineNumber === undefined ? undefined : { lineNumber, columnNumber }, omitFocus);
    }
    showEditor() {
        if (WrapperView.isShowing()) {
            return;
        }
        void this.setAsCurrentPanel();
    }
    showUILocation(uiLocation, omitFocus) {
        this.showUISourceCode(uiLocation.uiSourceCode, uiLocation.lineNumber, uiLocation.columnNumber, omitFocus);
    }
    revealInNavigator(uiSourceCode, skipReveal) {
        for (const navigator of registeredNavigatorViews) {
            const navigatorView = navigator.navigatorView();
            const viewId = navigator.viewId;
            if (viewId && navigatorView.acceptProject(uiSourceCode.project())) {
                navigatorView.revealUISourceCode(uiSourceCode, true);
                if (skipReveal) {
                    this.navigatorTabbedLocation.tabbedPane().selectTab(viewId);
                }
                else {
                    void UI.ViewManager.ViewManager.instance().showView(viewId);
                }
            }
        }
    }
    toggleAuthoredDeployedExperiment() {
        const experiment = Root.Runtime.ExperimentName.AUTHORED_DEPLOYED_GROUPING;
        const checked = Root.Runtime.experiments.isEnabled(experiment);
        Root.Runtime.experiments.setEnabled(experiment, !checked);
        Host.userMetrics.experimentChanged(experiment, checked);
        // Need to signal to the NavigatorView that grouping has changed. Unfortunately,
        // it can't listen to an experiment, and this class doesn't directly interact
        // with it, so we will convince it a different grouping setting changed. When we switch
        // from using an experiment to a setting, it will listen to that setting and we
        // won't need to do this.
        const groupByFolderSetting = Common.Settings.Settings.instance().moduleSetting('navigatorGroupByFolder');
        groupByFolderSetting.set(groupByFolderSetting.get());
    }
    populateNavigatorMenu(contextMenu) {
        const groupByFolderSetting = Common.Settings.Settings.instance().moduleSetting('navigatorGroupByFolder');
        contextMenu.appendItemsAtLocation('navigatorMenu');
        contextMenu.viewSection().appendCheckboxItem(i18nString(UIStrings.groupByFolder), () => groupByFolderSetting.set(!groupByFolderSetting.get()), groupByFolderSetting.get());
        const previewIcon = new IconButton.Icon.Icon();
        const experiment = Root.Runtime.ExperimentName.AUTHORED_DEPLOYED_GROUPING;
        previewIcon.data = {
            iconName: 'ic_preview_feature',
            color: 'var(--icon-color)',
            width: '14px',
        };
        contextMenu.viewSection().appendCheckboxItem(i18nString(UIStrings.groupByAuthored), this.toggleAuthoredDeployedExperiment, Root.Runtime.experiments.isEnabled(experiment), false, previewIcon);
    }
    setIgnoreExecutionLineEvents(ignoreExecutionLineEvents) {
        this.ignoreExecutionLineEvents = ignoreExecutionLineEvents;
    }
    updateLastModificationTime() {
        this.lastModificationTime = window.performance.now();
    }
    async executionLineChanged(liveLocation) {
        const uiLocation = await liveLocation.uiLocation();
        if (liveLocation.isDisposed()) {
            return;
        }
        if (!uiLocation) {
            return;
        }
        if (window.performance.now() - this.lastModificationTime < lastModificationTimeout) {
            return;
        }
        this.sourcesViewInternal.showSourceLocation(uiLocation.uiSourceCode, uiLocation, undefined, true);
    }
    lastModificationTimeoutPassedForTest() {
        lastModificationTimeout = Number.MIN_VALUE;
    }
    updateLastModificationTimeForTest() {
        lastModificationTimeout = Number.MAX_VALUE;
    }
    async callFrameChanged() {
        const callFrame = UI.Context.Context.instance().flavor(SDK.DebuggerModel.CallFrame);
        if (!callFrame) {
            return;
        }
        if (this.executionLineLocation) {
            this.executionLineLocation.dispose();
        }
        this.executionLineLocation =
            await Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance().createCallFrameLiveLocation(callFrame.location(), this.executionLineChanged.bind(this), this.liveLocationPool);
    }
    pauseOnExceptionEnabledChanged() {
        const enabled = Common.Settings.Settings.instance().moduleSetting('pauseOnExceptionEnabled').get();
        const button = this.pauseOnExceptionButton;
        button.setToggled(enabled);
        button.setTitle(enabled ? i18nString(UIStrings.dontPauseOnExceptions) : i18nString(UIStrings.pauseOnExceptions));
        this.debugToolbarDrawer.classList.toggle('expanded', enabled);
    }
    async updateDebuggerButtonsAndStatus() {
        const currentTarget = UI.Context.Context.instance().flavor(SDK.Target.Target);
        const currentDebuggerModel = currentTarget ? currentTarget.model(SDK.DebuggerModel.DebuggerModel) : null;
        if (!currentDebuggerModel) {
            this.togglePauseAction.setEnabled(false);
            this.stepOverAction.setEnabled(false);
            this.stepIntoAction.setEnabled(false);
            this.stepOutAction.setEnabled(false);
            this.stepAction.setEnabled(false);
        }
        else if (this.pausedInternal) {
            this.togglePauseAction.setToggled(true);
            this.togglePauseAction.setEnabled(true);
            this.stepOverAction.setEnabled(true);
            this.stepIntoAction.setEnabled(true);
            this.stepOutAction.setEnabled(true);
            this.stepAction.setEnabled(true);
        }
        else {
            this.togglePauseAction.setToggled(false);
            this.togglePauseAction.setEnabled(!currentDebuggerModel.isPausing());
            this.stepOverAction.setEnabled(false);
            this.stepIntoAction.setEnabled(false);
            this.stepOutAction.setEnabled(false);
            this.stepAction.setEnabled(false);
        }
        const details = currentDebuggerModel ? currentDebuggerModel.debuggerPausedDetails() : null;
        await this.debuggerPausedMessage.render(details, Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance(), Bindings.BreakpointManager.BreakpointManager.instance());
        if (details) {
            this.updateDebuggerButtonsAndStatusForTest();
        }
    }
    updateDebuggerButtonsAndStatusForTest() {
    }
    clearInterface() {
        void this.updateDebuggerButtonsAndStatus();
        UI.Context.Context.instance().setFlavor(SDK.DebuggerModel.DebuggerPausedDetails, null);
        if (this.switchToPausedTargetTimeout) {
            clearTimeout(this.switchToPausedTargetTimeout);
        }
        this.liveLocationPool.disposeAll();
    }
    switchToPausedTarget(debuggerModel) {
        delete this.switchToPausedTargetTimeout;
        if (this.pausedInternal || debuggerModel.isPaused()) {
            return;
        }
        for (const debuggerModel of SDK.TargetManager.TargetManager.instance().models(SDK.DebuggerModel.DebuggerModel)) {
            if (debuggerModel.isPaused()) {
                UI.Context.Context.instance().setFlavor(SDK.Target.Target, debuggerModel.target());
                break;
            }
        }
    }
    togglePauseOnExceptions() {
        Common.Settings.Settings.instance()
            .moduleSetting('pauseOnExceptionEnabled')
            // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
            // @ts-expect-error
            .set(!(this.pauseOnExceptionButton).toggled());
    }
    runSnippet() {
        const uiSourceCode = this.sourcesViewInternal.currentUISourceCode();
        if (uiSourceCode) {
            void Snippets.ScriptSnippetFileSystem.evaluateScriptSnippet(uiSourceCode);
        }
    }
    editorSelected(event) {
        const uiSourceCode = event.data;
        if (this.editorView.mainWidget() &&
            Common.Settings.Settings.instance().moduleSetting('autoRevealInNavigator').get()) {
            this.revealInNavigator(uiSourceCode, true);
        }
    }
    togglePause() {
        const target = UI.Context.Context.instance().flavor(SDK.Target.Target);
        if (!target) {
            return true;
        }
        const debuggerModel = target.model(SDK.DebuggerModel.DebuggerModel);
        if (!debuggerModel) {
            return true;
        }
        if (this.pausedInternal) {
            this.pausedInternal = false;
            debuggerModel.resume();
        }
        else {
            // Make sure pauses didn't stick skipped.
            debuggerModel.pause();
        }
        this.clearInterface();
        return true;
    }
    prepareToResume() {
        if (!this.pausedInternal) {
            return null;
        }
        this.pausedInternal = false;
        this.clearInterface();
        const target = UI.Context.Context.instance().flavor(SDK.Target.Target);
        return target ? target.model(SDK.DebuggerModel.DebuggerModel) : null;
    }
    longResume() {
        const debuggerModel = this.prepareToResume();
        if (debuggerModel) {
            debuggerModel.skipAllPausesUntilReloadOrTimeout(500);
            debuggerModel.resume();
        }
    }
    terminateExecution() {
        const debuggerModel = this.prepareToResume();
        if (debuggerModel) {
            void debuggerModel.runtimeModel().terminateExecution();
            debuggerModel.resume();
        }
    }
    stepOver() {
        const debuggerModel = this.prepareToResume();
        if (debuggerModel) {
            void debuggerModel.stepOver();
        }
        return true;
    }
    stepInto() {
        const debuggerModel = this.prepareToResume();
        if (debuggerModel) {
            void debuggerModel.stepInto();
        }
        return true;
    }
    stepIntoAsync() {
        const debuggerModel = this.prepareToResume();
        if (debuggerModel) {
            debuggerModel.scheduleStepIntoAsync();
        }
        return true;
    }
    stepOut() {
        const debuggerModel = this.prepareToResume();
        if (debuggerModel) {
            void debuggerModel.stepOut();
        }
        return true;
    }
    async continueToLocation(uiLocation) {
        const executionContext = UI.Context.Context.instance().flavor(SDK.RuntimeModel.ExecutionContext);
        if (!executionContext) {
            return;
        }
        // Always use 0 column.
        const rawLocations = await Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance().uiLocationToRawLocations(uiLocation.uiSourceCode, uiLocation.lineNumber, 0);
        const rawLocation = rawLocations.find(location => location.debuggerModel === executionContext.debuggerModel);
        if (rawLocation && this.prepareToResume()) {
            rawLocation.continueToLocation();
        }
    }
    toggleBreakpointsActive() {
        Common.Settings.Settings.instance()
            .moduleSetting('breakpointsActive')
            .set(!Common.Settings.Settings.instance().moduleSetting('breakpointsActive').get());
    }
    breakpointsActiveStateChanged() {
        const active = Common.Settings.Settings.instance().moduleSetting('breakpointsActive').get();
        this.toggleBreakpointsActiveAction.setToggled(!active);
        this.sourcesViewInternal.toggleBreakpointsActiveState(active);
    }
    createDebugToolbar() {
        const debugToolbar = new UI.Toolbar.Toolbar('scripts-debug-toolbar');
        const longResumeButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.resumeWithAllPausesBlockedForMs), 'largeicon-play');
        longResumeButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.longResume, this);
        const terminateExecutionButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.terminateCurrentJavascriptCall), 'largeicon-terminate-execution');
        terminateExecutionButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.terminateExecution, this);
        debugToolbar.appendToolbarItem(UI.Toolbar.Toolbar.createLongPressActionButton(this.togglePauseAction, [terminateExecutionButton, longResumeButton], []));
        debugToolbar.appendToolbarItem(UI.Toolbar.Toolbar.createActionButton(this.stepOverAction));
        debugToolbar.appendToolbarItem(UI.Toolbar.Toolbar.createActionButton(this.stepIntoAction));
        debugToolbar.appendToolbarItem(UI.Toolbar.Toolbar.createActionButton(this.stepOutAction));
        debugToolbar.appendToolbarItem(UI.Toolbar.Toolbar.createActionButton(this.stepAction));
        debugToolbar.appendSeparator();
        debugToolbar.appendToolbarItem(UI.Toolbar.Toolbar.createActionButton(this.toggleBreakpointsActiveAction));
        this.pauseOnExceptionButton = new UI.Toolbar.ToolbarToggle('', 'largeicon-pause-on-exceptions');
        this.pauseOnExceptionButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.togglePauseOnExceptions, this);
        debugToolbar.appendToolbarItem(this.pauseOnExceptionButton);
        return debugToolbar;
    }
    createDebugToolbarDrawer() {
        const debugToolbarDrawer = document.createElement('div');
        debugToolbarDrawer.classList.add('scripts-debug-toolbar-drawer');
        const label = i18nString(UIStrings.pauseOnCaughtExceptions);
        const setting = Common.Settings.Settings.instance().moduleSetting('pauseOnCaughtException');
        debugToolbarDrawer.appendChild(UI.SettingsUI.createSettingCheckbox(label, setting, true));
        return debugToolbarDrawer;
    }
    appendApplicableItems(event, contextMenu, target) {
        this.appendUISourceCodeItems(event, contextMenu, target);
        this.appendUISourceCodeFrameItems(event, contextMenu, target);
        this.appendUILocationItems(contextMenu, target);
        this.appendRemoteObjectItems(contextMenu, target);
        this.appendNetworkRequestItems(contextMenu, target);
    }
    appendUISourceCodeItems(event, contextMenu, target) {
        if (!(target instanceof Workspace.UISourceCode.UISourceCode) || !event.target) {
            return;
        }
        const uiSourceCode = target;
        const eventTarget = event.target;
        if (!uiSourceCode.project().isServiceProject() &&
            !eventTarget.isSelfOrDescendant(this.navigatorTabbedLocation.widget().element)) {
            contextMenu.revealSection().appendItem(i18nString(UIStrings.revealInSidebar), this.handleContextMenuReveal.bind(this, uiSourceCode));
        }
    }
    appendUISourceCodeFrameItems(event, contextMenu, target) {
        if (!(target instanceof UISourceCodeFrame)) {
            return;
        }
        if (target.uiSourceCode().contentType().isFromSourceMap() || target.textEditor.state.selection.main.empty) {
            return;
        }
        contextMenu.debugSection().appendAction('debugger.evaluate-selection');
    }
    appendUILocationItems(contextMenu, object) {
        if (!(object instanceof Workspace.UISourceCode.UILocation)) {
            return;
        }
        const uiLocation = object;
        const uiSourceCode = uiLocation.uiSourceCode;
        if (!Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance()
            .scriptsForUISourceCode(uiSourceCode)
            .every(script => script.isJavaScript())) {
            // Ignore List and 'Continue to here' currently only works for JavaScript debugging.
            return;
        }
        const contentType = uiSourceCode.contentType();
        if (contentType.hasScripts()) {
            const target = UI.Context.Context.instance().flavor(SDK.Target.Target);
            const debuggerModel = target ? target.model(SDK.DebuggerModel.DebuggerModel) : null;
            if (debuggerModel && debuggerModel.isPaused()) {
                contextMenu.debugSection().appendItem(i18nString(UIStrings.continueToHere), this.continueToLocation.bind(this, uiLocation));
            }
            this.callstackPane.appendIgnoreListURLContextMenuItems(contextMenu, uiSourceCode);
        }
    }
    handleContextMenuReveal(uiSourceCode) {
        this.editorView.showBoth();
        this.revealInNavigator(uiSourceCode);
    }
    appendRemoteObjectItems(contextMenu, target) {
        if (!(target instanceof SDK.RemoteObject.RemoteObject)) {
            return;
        }
        const indent = Common.Settings.Settings.instance().moduleSetting('textEditorIndent').get();
        const remoteObject = target;
        const executionContext = UI.Context.Context.instance().flavor(SDK.RuntimeModel.ExecutionContext);
        function getObjectTitle() {
            if (remoteObject.type === 'wasm') {
                return remoteObject.subtype;
            }
            if (remoteObject.subtype === 'node') {
                return 'outerHTML';
            }
            return remoteObject.type;
        }
        const copyContextMenuTitle = getObjectTitle();
        contextMenu.debugSection().appendItem(i18nString(UIStrings.storeSAsGlobalVariable, { PH1: String(copyContextMenuTitle) }), () => SDK.ConsoleModel.ConsoleModel.instance().saveToTempVariable(executionContext, remoteObject));
        const ctxMenuClipboardSection = contextMenu.clipboardSection();
        const inspectorFrontendHost = Host.InspectorFrontendHost.InspectorFrontendHostInstance;
        if (remoteObject.type === 'string') {
            ctxMenuClipboardSection.appendItem(i18nString(UIStrings.copyStringContents), () => {
                inspectorFrontendHost.copyText(remoteObject.value);
            });
            ctxMenuClipboardSection.appendItem(i18nString(UIStrings.copyStringAsJSLiteral), () => {
                inspectorFrontendHost.copyText(Platform.StringUtilities.formatAsJSLiteral(remoteObject.value));
            });
            ctxMenuClipboardSection.appendItem(i18nString(UIStrings.copyStringAsJSONLiteral), () => {
                inspectorFrontendHost.copyText(JSON.stringify(remoteObject.value));
            });
        }
        // We are trying to copy a primitive value.
        else if (primitiveRemoteObjectTypes.has(remoteObject.type)) {
            ctxMenuClipboardSection.appendItem(i18nString(UIStrings.copyS, { PH1: String(copyContextMenuTitle) }), () => {
                inspectorFrontendHost.copyText(remoteObject.description);
            });
        }
        // We are trying to copy a remote object.
        else if (remoteObject.type === 'object') {
            const copyDecodedValueHandler = async () => {
                const result = await remoteObject.callFunctionJSON(toStringForClipboard, [{
                        value: {
                            subtype: remoteObject.subtype,
                            indent: indent,
                        },
                    }]);
                inspectorFrontendHost.copyText(result);
            };
            ctxMenuClipboardSection.appendItem(i18nString(UIStrings.copyS, { PH1: String(copyContextMenuTitle) }), copyDecodedValueHandler);
        }
        else if (remoteObject.type === 'function') {
            contextMenu.debugSection().appendItem(i18nString(UIStrings.showFunctionDefinition), this.showFunctionDefinition.bind(this, remoteObject));
        }
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        function toStringForClipboard(data) {
            const subtype = data.subtype;
            const indent = data.indent;
            if (subtype === 'node') {
                return this instanceof Element ? this.outerHTML : undefined;
            }
            if (subtype && typeof this === 'undefined') {
                return String(subtype);
            }
            try {
                return JSON.stringify(this, null, indent);
            }
            catch (error) {
                return String(this);
            }
        }
    }
    appendNetworkRequestItems(contextMenu, target) {
        if (!(target instanceof SDK.NetworkRequest.NetworkRequest)) {
            return;
        }
        const request = target;
        const uiSourceCode = this.workspace.uiSourceCodeForURL(request.url());
        if (!uiSourceCode) {
            return;
        }
        const openText = i18nString(UIStrings.openInSourcesPanel);
        const callback = this.showUILocation.bind(this, uiSourceCode.uiLocation(0, 0));
        contextMenu.revealSection().appendItem(openText, callback);
    }
    showFunctionDefinition(remoteObject) {
        void remoteObject.debuggerModel().functionDetailsPromise(remoteObject).then(this.didGetFunctionDetails.bind(this));
    }
    async didGetFunctionDetails(response) {
        if (!response || !response.location) {
            return;
        }
        const uiLocation = await Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance().rawLocationToUILocation(response.location);
        if (uiLocation) {
            this.showUILocation(uiLocation);
        }
    }
    revealNavigatorSidebar() {
        void this.setAsCurrentPanel();
        this.editorView.showBoth(true);
    }
    revealDebuggerSidebar() {
        if (!Common.Settings.Settings.instance().moduleSetting('autoFocusOnDebuggerPausedEnabled').get()) {
            return;
        }
        void this.setAsCurrentPanel();
        this.splitWidget.showBoth(true);
    }
    updateSidebarPosition() {
        let vertically;
        const position = Common.Settings.Settings.instance().moduleSetting('sidebarPosition').get();
        if (position === 'right') {
            vertically = false;
        }
        else if (position === 'bottom') {
            vertically = true;
        }
        else {
            vertically = UI.InspectorView.InspectorView.instance().element.offsetWidth < 680;
        }
        if (this.sidebarPaneView && vertically === !this.splitWidget.isVertical()) {
            return;
        }
        if (this.sidebarPaneView && this.sidebarPaneView.shouldHideOnDetach()) {
            return;
        } // We can't reparent extension iframes.
        if (this.sidebarPaneView) {
            this.sidebarPaneView.detach();
        }
        this.splitWidget.setVertical(!vertically);
        this.splitWidget.element.classList.toggle('sources-split-view-vertical', vertically);
        SourcesPanel.updateResizerAndSidebarButtons(this);
        // Create vertical box with stack.
        const vbox = new UI.Widget.VBox();
        vbox.element.appendChild(this.debugToolbar.element);
        vbox.element.appendChild(this.debugToolbarDrawer);
        vbox.setMinimumAndPreferredSizes(minToolbarWidth, 25, minToolbarWidth, 100);
        this.sidebarPaneStack =
            UI.ViewManager.ViewManager.instance().createStackLocation(this.revealDebuggerSidebar.bind(this));
        this.sidebarPaneStack.widget().element.classList.add('overflow-auto');
        this.sidebarPaneStack.widget().show(vbox.element);
        this.sidebarPaneStack.widget().element.appendChild(this.debuggerPausedMessage.element());
        this.sidebarPaneStack.appendApplicableItems('sources.sidebar-top');
        if (this.threadsSidebarPane) {
            void this.sidebarPaneStack.showView(this.threadsSidebarPane);
        }
        const jsBreakpoints = UI.ViewManager.ViewManager.instance().view('sources.jsBreakpoints');
        const scopeChainView = UI.ViewManager.ViewManager.instance().view('sources.scopeChain');
        if (this.tabbedLocationHeader) {
            this.splitWidget.uninstallResizer(this.tabbedLocationHeader);
            this.tabbedLocationHeader = null;
        }
        if (!vertically) {
            // Populate the rest of the stack.
            this.sidebarPaneStack.appendView(this.watchSidebarPane);
            void this.sidebarPaneStack.showView(jsBreakpoints);
            void this.sidebarPaneStack.showView(scopeChainView);
            void this.sidebarPaneStack.showView(this.callstackPane);
            this.extensionSidebarPanesContainer = this.sidebarPaneStack;
            this.sidebarPaneView = vbox;
            this.splitWidget.uninstallResizer(this.debugToolbar.gripElementForResize());
        }
        else {
            const splitWidget = new UI.SplitWidget.SplitWidget(true, true, 'sourcesPanelDebuggerSidebarSplitViewState', 0.5);
            splitWidget.setMainWidget(vbox);
            // Populate the left stack.
            void this.sidebarPaneStack.showView(jsBreakpoints);
            void this.sidebarPaneStack.showView(this.callstackPane);
            const tabbedLocation = UI.ViewManager.ViewManager.instance().createTabbedLocation(this.revealDebuggerSidebar.bind(this));
            splitWidget.setSidebarWidget(tabbedLocation.tabbedPane());
            this.tabbedLocationHeader = tabbedLocation.tabbedPane().headerElement();
            this.splitWidget.installResizer(this.tabbedLocationHeader);
            this.splitWidget.installResizer(this.debugToolbar.gripElementForResize());
            tabbedLocation.appendView(scopeChainView);
            tabbedLocation.appendView(this.watchSidebarPane);
            tabbedLocation.appendApplicableItems('sources.sidebar-tabs');
            this.extensionSidebarPanesContainer = tabbedLocation;
            this.sidebarPaneView = splitWidget;
        }
        this.sidebarPaneStack.appendApplicableItems('sources.sidebar-bottom');
        const extensionSidebarPanes = Extensions.ExtensionServer.ExtensionServer.instance().sidebarPanes();
        for (let i = 0; i < extensionSidebarPanes.length; ++i) {
            this.addExtensionSidebarPane(extensionSidebarPanes[i]);
        }
        this.splitWidget.setSidebarWidget(this.sidebarPaneView);
    }
    setAsCurrentPanel() {
        return UI.ViewManager.ViewManager.instance().showView('sources');
    }
    extensionSidebarPaneAdded(event) {
        this.addExtensionSidebarPane(event.data);
    }
    addExtensionSidebarPane(pane) {
        if (pane.panelName() === this.name) {
            this.extensionSidebarPanesContainer.appendView(pane);
        }
    }
    sourcesView() {
        return this.sourcesViewInternal;
    }
    handleDrop(dataTransfer) {
        const items = dataTransfer.items;
        if (!items.length) {
            return;
        }
        const entry = items[0].webkitGetAsEntry();
        if (entry && entry.isDirectory) {
            Host.InspectorFrontendHost.InspectorFrontendHostInstance.upgradeDraggedFileSystemPermissions(entry.filesystem);
        }
    }
}
export let lastModificationTimeout = 200;
export const minToolbarWidth = 215;
let uILocationRevealerInstance;
export class UILocationRevealer {
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!uILocationRevealerInstance || forceNew) {
            uILocationRevealerInstance = new UILocationRevealer();
        }
        return uILocationRevealerInstance;
    }
    async reveal(uiLocation, omitFocus) {
        if (!(uiLocation instanceof Workspace.UISourceCode.UILocation)) {
            throw new Error('Internal error: not a ui location');
        }
        SourcesPanel.instance().showUILocation(uiLocation, omitFocus);
    }
}
let debuggerLocationRevealerInstance;
export class DebuggerLocationRevealer {
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!debuggerLocationRevealerInstance || forceNew) {
            debuggerLocationRevealerInstance = new DebuggerLocationRevealer();
        }
        return debuggerLocationRevealerInstance;
    }
    async reveal(rawLocation, omitFocus) {
        if (!(rawLocation instanceof SDK.DebuggerModel.Location)) {
            throw new Error('Internal error: not a debugger location');
        }
        const uiLocation = await Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance().rawLocationToUILocation(rawLocation);
        if (uiLocation) {
            SourcesPanel.instance().showUILocation(uiLocation, omitFocus);
        }
    }
}
let uISourceCodeRevealerInstance;
export class UISourceCodeRevealer {
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!uISourceCodeRevealerInstance || forceNew) {
            uISourceCodeRevealerInstance = new UISourceCodeRevealer();
        }
        return uISourceCodeRevealerInstance;
    }
    async reveal(uiSourceCode, omitFocus) {
        if (!(uiSourceCode instanceof Workspace.UISourceCode.UISourceCode)) {
            throw new Error('Internal error: not a ui source code');
        }
        SourcesPanel.instance().showUISourceCode(uiSourceCode, undefined, undefined, omitFocus);
    }
}
let debuggerPausedDetailsRevealerInstance;
export class DebuggerPausedDetailsRevealer {
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!debuggerPausedDetailsRevealerInstance || forceNew) {
            debuggerPausedDetailsRevealerInstance = new DebuggerPausedDetailsRevealer();
        }
        return debuggerPausedDetailsRevealerInstance;
    }
    async reveal(_object) {
        if (Common.Settings.Settings.instance().moduleSetting('autoFocusOnDebuggerPausedEnabled').get()) {
            return SourcesPanel.instance().setAsCurrentPanel();
        }
    }
}
let revealingActionDelegateInstance;
export class RevealingActionDelegate {
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!revealingActionDelegateInstance || forceNew) {
            revealingActionDelegateInstance = new RevealingActionDelegate();
        }
        return revealingActionDelegateInstance;
    }
    handleAction(context, actionId) {
        const panel = SourcesPanel.instance();
        if (!panel.ensureSourcesViewVisible()) {
            return false;
        }
        switch (actionId) {
            case 'debugger.toggle-pause': {
                // This action can be triggered both on the DevTools front-end itself,
                // or on the inspected target. If triggered on the DevTools front-end,
                // it will take care of resuming.
                //
                // If triggered on the target, NOT in hosted mode:
                //   * ..and the paused overlay is enabled:
                //       => do not take any action here, as the paused overlay will resume
                //   * ..and the paused overlay is disabled:
                //       => take care of the resume here
                // If triggered on the target in hosted mode:
                //   * ..and the paused overlay is enabled:
                //       => execution will not reach here, as shortcuts are not forwarded
                //          and the paused overlay will resume
                //   * ..and the paused overlay is disabled:
                //       => overlay will not take care of resume, and neither will
                //          DevTools as no shortcuts are forwarded from the target
                // Do not trigger a resume action, if: the shortcut was forwarded and the
                // paused overlay is enabled.
                const actionHandledInPausedOverlay = context.flavor(UI.ShortcutRegistry.ForwardedShortcut) &&
                    !Common.Settings.Settings.instance().moduleSetting('disablePausedStateOverlay').get();
                if (actionHandledInPausedOverlay) {
                    // Taken care of by inspector overlay: handled set to true to
                    // register user metric.
                    return true;
                }
                panel.togglePause();
                return true;
            }
        }
        return false;
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
        const panel = SourcesPanel.instance();
        switch (actionId) {
            case 'debugger.step-over': {
                panel.stepOver();
                return true;
            }
            case 'debugger.step-into': {
                panel.stepIntoAsync();
                return true;
            }
            case 'debugger.step': {
                panel.stepInto();
                return true;
            }
            case 'debugger.step-out': {
                panel.stepOut();
                return true;
            }
            case 'debugger.run-snippet': {
                panel.runSnippet();
                return true;
            }
            case 'debugger.toggle-breakpoints-active': {
                panel.toggleBreakpointsActive();
                return true;
            }
            case 'debugger.evaluate-selection': {
                const frame = UI.Context.Context.instance().flavor(UISourceCodeFrame);
                if (frame) {
                    const { state: editorState } = frame.textEditor;
                    let text = editorState.sliceDoc(editorState.selection.main.from, editorState.selection.main.to);
                    const executionContext = UI.Context.Context.instance().flavor(SDK.RuntimeModel.ExecutionContext);
                    if (executionContext) {
                        const message = SDK.ConsoleModel.ConsoleModel.instance().addCommandMessage(executionContext, text);
                        text = ObjectUI.JavaScriptREPL.JavaScriptREPL.wrapObjectLiteral(text);
                        void SDK.ConsoleModel.ConsoleModel.instance().evaluateCommandInConsole(executionContext, message, text, /* useCommandLineAPI */ true);
                    }
                }
                return true;
            }
            case 'sources.toggle-navigator-sidebar': {
                panel.toggleNavigatorSidebar();
                return true;
            }
            case 'sources.toggle-debugger-sidebar': {
                panel.toggleDebuggerSidebar();
                return true;
            }
        }
        return false;
    }
}
export class WrapperView extends UI.Widget.VBox {
    view;
    constructor() {
        super();
        this.element.classList.add('sources-view-wrapper');
        this.view = SourcesPanel.instance().sourcesView();
    }
    static instance() {
        if (!wrapperViewInstance) {
            wrapperViewInstance = new WrapperView();
        }
        return wrapperViewInstance;
    }
    static isShowing() {
        return Boolean(wrapperViewInstance) && wrapperViewInstance.isShowing();
    }
    wasShown() {
        if (!SourcesPanel.instance().isShowing()) {
            this.showViewInWrapper();
        }
        else {
            UI.InspectorView.InspectorView.instance().setDrawerMinimized(true);
        }
        SourcesPanel.updateResizerAndSidebarButtons(SourcesPanel.instance());
    }
    willHide() {
        UI.InspectorView.InspectorView.instance().setDrawerMinimized(false);
        queueMicrotask(() => {
            SourcesPanel.updateResizerAndSidebarButtons(SourcesPanel.instance());
        });
    }
    showViewInWrapper() {
        this.view.show(this.element);
    }
}
const registeredNavigatorViews = [
    {
        viewId: 'navigator-network',
        navigatorView: NetworkNavigatorView.instance,
        experiment: undefined,
    },
    {
        viewId: 'navigator-files',
        navigatorView: FilesNavigatorView.instance,
        experiment: undefined,
    },
    {
        viewId: 'navigator-snippets',
        navigatorView: SnippetsNavigatorView.instance,
        experiment: undefined,
    },
    {
        viewId: 'navigator-overrides',
        navigatorView: OverridesNavigatorView.instance,
        experiment: undefined,
    },
    {
        viewId: 'navigator-contentScripts',
        navigatorView: ContentScriptsNavigatorView.instance,
        experiment: undefined,
    },
];
//# sourceMappingURL=SourcesPanel.js.map
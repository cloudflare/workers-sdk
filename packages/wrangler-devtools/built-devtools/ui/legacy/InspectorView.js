/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Root from '../../core/root/root.js';
import { Dialog } from './Dialog.js';
import { DockController } from './DockController.js';
import { GlassPane } from './GlassPane.js';
import { Infobar, Type as InfobarType } from './Infobar.js';
import { KeyboardShortcut } from './KeyboardShortcut.js';
import { SplitWidget } from './SplitWidget.js';
import { Events as TabbedPaneEvents } from './TabbedPane.js';
import { ToolbarButton } from './Toolbar.js';
import { ViewManager } from './ViewManager.js';
import { VBox, WidgetFocusRestorer } from './Widget.js';
import * as ARIAUtils from './ARIAUtils.js';
import inspectorViewTabbedPaneStyles from './inspectorViewTabbedPane.css.legacy.js';
const UIStrings = {
    /**
    *@description Title of more tabs button in inspector view
    */
    moreTools: 'More Tools',
    /**
    *@description Text that appears when hovor over the close button on the drawer view
    */
    closeDrawer: 'Close drawer',
    /**
    *@description The aria label for main tabbed pane that contains Panels
    */
    panels: 'Panels',
    /**
    *@description Title of an action that reloads the DevTools
    */
    reloadDevtools: 'Reload DevTools',
    /**
    *@description Text for context menu action to move a tab to the main panel
    */
    moveToTop: 'Move to top',
    /**
    *@description Text for context menu action to move a tab to the drawer
    */
    moveToBottom: 'Move to bottom',
    /**
     * @description Text shown in a prompt to the user when DevTools is started and the
     * currently selected DevTools locale does not match Chrome's locale.
     * The placeholder is the current Chrome language.
     * @example {German} PH1
     */
    devToolsLanguageMissmatch: 'DevTools is now available in {PH1}!',
    /**
     * @description An option the user can select when we notice that DevTools
     * is configured with a different locale than Chrome. This option means DevTools will
     * always try and display the DevTools UI in the same language as Chrome.
     */
    setToBrowserLanguage: 'Always match Chrome\'s language',
    /**
     * @description An option the user can select when DevTools notices that DevTools
     * is configured with a different locale than Chrome. This option means DevTools UI
     * will be switched to the language specified in the placeholder.
     * @example {German} PH1
     */
    setToSpecificLanguage: 'Switch DevTools to {PH1}',
    /**
    *@description The aria label for main toolbar
    */
    mainToolbar: 'Main toolbar',
    /**
    *@description The aria label for the drawer.
    */
    drawer: 'Tool drawer',
    /**
    *@description The aria label for the drawer shown.
    */
    drawerShown: 'Drawer shown',
    /**
    *@description The aria label for the drawer hidden.
    */
    drawerHidden: 'Drawer hidden',
    /**
    * @description Request for the user to select a local file system folder for DevTools
    * to store local overrides in.
    */
    selectOverrideFolder: 'Select a folder to store override files in.',
    /**
    *@description Label for a button which opens a file picker.
    */
    selectFolder: 'Select folder',
};
const str_ = i18n.i18n.registerUIStrings('ui/legacy/InspectorView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
let inspectorViewInstance;
export class InspectorView extends VBox {
    drawerSplitWidget;
    tabDelegate;
    drawerTabbedLocation;
    drawerTabbedPane;
    infoBarDiv;
    tabbedLocation;
    tabbedPane;
    keyDownBound;
    currentPanelLocked;
    focusRestorer;
    ownerSplitWidget;
    reloadRequiredInfobar;
    #selectOverrideFolderInfobar;
    constructor() {
        super();
        GlassPane.setContainer(this.element);
        this.setMinimumSize(250, 72);
        // DevTools sidebar is a vertical split of panels tabbed pane and a drawer.
        this.drawerSplitWidget = new SplitWidget(false, true, 'Inspector.drawerSplitViewState', 200, 200);
        this.drawerSplitWidget.hideSidebar();
        this.drawerSplitWidget.enableShowModeSaving();
        this.drawerSplitWidget.show(this.element);
        this.tabDelegate = new InspectorViewTabDelegate();
        // Create drawer tabbed pane.
        this.drawerTabbedLocation =
            ViewManager.instance().createTabbedLocation(this.showDrawer.bind(this, false), 'drawer-view', true, true);
        const moreTabsButton = this.drawerTabbedLocation.enableMoreTabsButton();
        moreTabsButton.setTitle(i18nString(UIStrings.moreTools));
        this.drawerTabbedPane = this.drawerTabbedLocation.tabbedPane();
        this.drawerTabbedPane.setMinimumSize(0, 27);
        this.drawerTabbedPane.element.classList.add('drawer-tabbed-pane');
        const closeDrawerButton = new ToolbarButton(i18nString(UIStrings.closeDrawer), 'largeicon-delete');
        closeDrawerButton.addEventListener(ToolbarButton.Events.Click, this.closeDrawer, this);
        this.drawerTabbedPane.addEventListener(TabbedPaneEvents.TabSelected, this.tabSelected, this);
        this.drawerTabbedPane.setTabDelegate(this.tabDelegate);
        const drawerElement = this.drawerTabbedPane.element;
        ARIAUtils.markAsComplementary(drawerElement);
        ARIAUtils.setAccessibleName(drawerElement, i18nString(UIStrings.drawer));
        this.drawerSplitWidget.installResizer(this.drawerTabbedPane.headerElement());
        this.drawerSplitWidget.setSidebarWidget(this.drawerTabbedPane);
        this.drawerTabbedPane.rightToolbar().appendToolbarItem(closeDrawerButton);
        // Create main area tabbed pane.
        this.tabbedLocation = ViewManager.instance().createTabbedLocation(Host.InspectorFrontendHost.InspectorFrontendHostInstance.bringToFront.bind(Host.InspectorFrontendHost.InspectorFrontendHostInstance), 'panel', true, true, Root.Runtime.Runtime.queryParam('panel'));
        this.tabbedPane = this.tabbedLocation.tabbedPane();
        this.tabbedPane.element.classList.add('main-tabbed-pane');
        this.tabbedPane.registerRequiredCSS(inspectorViewTabbedPaneStyles);
        this.tabbedPane.addEventListener(TabbedPaneEvents.TabSelected, this.tabSelected, this);
        this.tabbedPane.setAccessibleName(i18nString(UIStrings.panels));
        this.tabbedPane.setTabDelegate(this.tabDelegate);
        const mainHeaderElement = this.tabbedPane.headerElement();
        ARIAUtils.markAsNavigation(mainHeaderElement);
        ARIAUtils.setAccessibleName(mainHeaderElement, i18nString(UIStrings.mainToolbar));
        // Store the initial selected panel for use in launch histograms
        Host.userMetrics.setLaunchPanel(this.tabbedPane.selectedTabId);
        if (Host.InspectorFrontendHost.isUnderTest()) {
            this.tabbedPane.setAutoSelectFirstItemOnShow(false);
        }
        this.drawerSplitWidget.setMainWidget(this.tabbedPane);
        this.keyDownBound = this.keyDown.bind(this);
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.events.addEventListener(Host.InspectorFrontendHostAPI.Events.ShowPanel, showPanel.bind(this));
        function showPanel({ data: panelName }) {
            void this.showPanel(panelName);
        }
        if (shouldShowLocaleInfobar()) {
            const infobar = createLocaleInfobar();
            infobar.setParentView(this);
            this.attachInfobar(infobar);
        }
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!inspectorViewInstance || forceNew) {
            inspectorViewInstance = new InspectorView();
        }
        return inspectorViewInstance;
    }
    static maybeGetInspectorViewInstance() {
        return inspectorViewInstance;
    }
    wasShown() {
        this.element.ownerDocument.addEventListener('keydown', this.keyDownBound, false);
    }
    willHide() {
        this.element.ownerDocument.removeEventListener('keydown', this.keyDownBound, false);
    }
    resolveLocation(locationName) {
        if (locationName === 'drawer-view') {
            return this.drawerTabbedLocation;
        }
        if (locationName === 'panel') {
            return this.tabbedLocation;
        }
        return null;
    }
    async createToolbars() {
        await this.tabbedPane.leftToolbar().appendItemsAtLocation('main-toolbar-left');
        await this.tabbedPane.rightToolbar().appendItemsAtLocation('main-toolbar-right');
    }
    addPanel(view) {
        this.tabbedLocation.appendView(view);
    }
    hasPanel(panelName) {
        return this.tabbedPane.hasTab(panelName);
    }
    async panel(panelName) {
        const view = ViewManager.instance().view(panelName);
        if (!view) {
            throw new Error(`Expected view for panel '${panelName}'`);
        }
        return view.widget();
    }
    onSuspendStateChanged(allTargetsSuspended) {
        this.currentPanelLocked = allTargetsSuspended;
        this.tabbedPane.setCurrentTabLocked(this.currentPanelLocked);
        this.tabbedPane.leftToolbar().setEnabled(!this.currentPanelLocked);
        this.tabbedPane.rightToolbar().setEnabled(!this.currentPanelLocked);
    }
    canSelectPanel(panelName) {
        return !this.currentPanelLocked || this.tabbedPane.selectedTabId === panelName;
    }
    async showPanel(panelName) {
        await ViewManager.instance().showView(panelName);
    }
    setPanelIcon(tabId, icon) {
        // Find the tabbed location where the panel lives
        const tabbedPane = this.getTabbedPaneForTabId(tabId);
        if (tabbedPane) {
            tabbedPane.setTabIcon(tabId, icon);
        }
    }
    emitDrawerChangeEvent(isDrawerOpen) {
        const evt = new CustomEvent(Events.DrawerChange, { bubbles: true, cancelable: true, detail: { isDrawerOpen } });
        document.body.dispatchEvent(evt);
    }
    getTabbedPaneForTabId(tabId) {
        // Tab exists in the main panel
        if (this.tabbedPane.hasTab(tabId)) {
            return this.tabbedPane;
        }
        // Tab exists in the drawer
        if (this.drawerTabbedPane.hasTab(tabId)) {
            return this.drawerTabbedPane;
        }
        // Tab is not open
        return null;
    }
    currentPanelDeprecated() {
        return ViewManager.instance().materializedWidget(this.tabbedPane.selectedTabId || '');
    }
    showDrawer(focus) {
        if (this.drawerTabbedPane.isShowing()) {
            return;
        }
        this.drawerSplitWidget.showBoth();
        if (focus) {
            this.focusRestorer = new WidgetFocusRestorer(this.drawerTabbedPane);
        }
        else {
            this.focusRestorer = null;
        }
        this.emitDrawerChangeEvent(true);
        ARIAUtils.alert(i18nString(UIStrings.drawerShown));
    }
    drawerVisible() {
        return this.drawerTabbedPane.isShowing();
    }
    closeDrawer() {
        if (!this.drawerTabbedPane.isShowing()) {
            return;
        }
        if (this.focusRestorer) {
            this.focusRestorer.restore();
        }
        this.drawerSplitWidget.hideSidebar(true);
        this.emitDrawerChangeEvent(false);
        ARIAUtils.alert(i18nString(UIStrings.drawerHidden));
    }
    setDrawerMinimized(minimized) {
        this.drawerSplitWidget.setSidebarMinimized(minimized);
        this.drawerSplitWidget.setResizable(!minimized);
    }
    isDrawerMinimized() {
        return this.drawerSplitWidget.isSidebarMinimized();
    }
    closeDrawerTab(id, userGesture) {
        this.drawerTabbedPane.closeTab(id, userGesture);
        Host.userMetrics.panelClosed(id);
    }
    keyDown(event) {
        const keyboardEvent = event;
        if (!KeyboardShortcut.eventHasCtrlEquivalentKey(keyboardEvent) || keyboardEvent.altKey || keyboardEvent.shiftKey) {
            return;
        }
        // Ctrl/Cmd + 1-9 should show corresponding panel.
        const panelShortcutEnabled = Common.Settings.moduleSetting('shortcutPanelSwitch').get();
        if (panelShortcutEnabled) {
            let panelIndex = -1;
            if (keyboardEvent.keyCode > 0x30 && keyboardEvent.keyCode < 0x3A) {
                panelIndex = keyboardEvent.keyCode - 0x31;
            }
            else if (keyboardEvent.keyCode > 0x60 && keyboardEvent.keyCode < 0x6A &&
                keyboardEvent.location === KeyboardEvent.DOM_KEY_LOCATION_NUMPAD) {
                panelIndex = keyboardEvent.keyCode - 0x61;
            }
            if (panelIndex !== -1) {
                const panelName = this.tabbedPane.tabIds()[panelIndex];
                if (panelName) {
                    if (!Dialog.hasInstance() && !this.currentPanelLocked) {
                        void this.showPanel(panelName);
                    }
                    event.consume(true);
                }
            }
        }
    }
    onResize() {
        GlassPane.containerMoved(this.element);
    }
    topResizerElement() {
        return this.tabbedPane.headerElement();
    }
    toolbarItemResized() {
        this.tabbedPane.headerResized();
    }
    tabSelected(event) {
        const { tabId } = event.data;
        Host.userMetrics.panelShown(tabId);
    }
    setOwnerSplit(splitWidget) {
        this.ownerSplitWidget = splitWidget;
    }
    ownerSplit() {
        return this.ownerSplitWidget || null;
    }
    minimize() {
        if (this.ownerSplitWidget) {
            this.ownerSplitWidget.setSidebarMinimized(true);
        }
    }
    restore() {
        if (this.ownerSplitWidget) {
            this.ownerSplitWidget.setSidebarMinimized(false);
        }
    }
    displayReloadRequiredWarning(message) {
        if (!this.reloadRequiredInfobar) {
            const infobar = new Infobar(InfobarType.Info, message, [
                {
                    text: i18nString(UIStrings.reloadDevtools),
                    highlight: true,
                    delegate: () => reloadDevTools(),
                    dismiss: false,
                },
            ]);
            infobar.setParentView(this);
            this.attachInfobar(infobar);
            this.reloadRequiredInfobar = infobar;
            infobar.setCloseCallback(() => {
                delete this.reloadRequiredInfobar;
            });
        }
    }
    displaySelectOverrideFolderInfobar(callback) {
        if (!this.#selectOverrideFolderInfobar) {
            const infobar = new Infobar(InfobarType.Info, i18nString(UIStrings.selectOverrideFolder), [
                {
                    text: i18nString(UIStrings.selectFolder),
                    highlight: true,
                    delegate: () => callback(),
                    dismiss: true,
                },
            ]);
            infobar.setParentView(this);
            this.attachInfobar(infobar);
            this.#selectOverrideFolderInfobar = infobar;
            infobar.setCloseCallback(() => {
                this.#selectOverrideFolderInfobar = undefined;
            });
        }
    }
    createInfoBarDiv() {
        if (!this.infoBarDiv) {
            this.infoBarDiv = document.createElement('div');
            this.infoBarDiv.classList.add('flex-none');
            this.contentElement.insertBefore(this.infoBarDiv, this.contentElement.firstChild);
        }
    }
    attachInfobar(infobar) {
        this.createInfoBarDiv();
        this.infoBarDiv?.appendChild(infobar.element);
    }
}
function getDisableLocaleInfoBarSetting() {
    return Common.Settings.Settings.instance().createSetting('disableLocaleInfoBar', false);
}
function shouldShowLocaleInfobar() {
    if (getDisableLocaleInfoBarSetting().get()) {
        return false;
    }
    // If the language setting is different than 'en-US', the user already
    // used the setting before, so don't show the toolbar.
    const languageSettingValue = Common.Settings.Settings.instance().moduleSetting('language').get();
    if (languageSettingValue !== 'en-US') {
        return false;
    }
    // When the selected DevTools locale differs from the locale of the browser UI, we want to notify
    // users only once, that they have the opportunity to adjust DevTools locale to match Chrome's locale.
    return !i18n.DevToolsLocale.localeLanguagesMatch(navigator.language, languageSettingValue) &&
        i18n.DevToolsLocale.DevToolsLocale.instance().languageIsSupportedByDevTools(navigator.language);
}
function createLocaleInfobar() {
    const devtoolsLocale = i18n.DevToolsLocale.DevToolsLocale.instance();
    const closestSupportedLocale = devtoolsLocale.lookupClosestDevToolsLocale(navigator.language);
    const locale = new Intl.Locale(closestSupportedLocale);
    const closestSupportedLanguageInCurrentLocale = new Intl.DisplayNames([devtoolsLocale.locale], { type: 'language' }).of(locale.language || 'en') || 'English';
    const languageSetting = Common.Settings.Settings.instance().moduleSetting('language');
    return new Infobar(InfobarType.Info, i18nString(UIStrings.devToolsLanguageMissmatch, { PH1: closestSupportedLanguageInCurrentLocale }), [
        {
            text: i18nString(UIStrings.setToBrowserLanguage),
            highlight: true,
            delegate: () => {
                languageSetting.set('browserLanguage');
                getDisableLocaleInfoBarSetting().set(true);
                reloadDevTools();
            },
            dismiss: true,
        },
        {
            text: i18nString(UIStrings.setToSpecificLanguage, { PH1: closestSupportedLanguageInCurrentLocale }),
            highlight: true,
            delegate: () => {
                languageSetting.set(closestSupportedLocale);
                getDisableLocaleInfoBarSetting().set(true);
                reloadDevTools();
            },
            dismiss: true,
        },
    ], getDisableLocaleInfoBarSetting());
}
function reloadDevTools() {
    if (DockController.instance().canDock() && DockController.instance().dockSide() === "undocked" /* UNDOCKED */) {
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.setIsDocked(true, function () { });
    }
    Host.InspectorFrontendHost.InspectorFrontendHostInstance.reattach(() => window.location.reload());
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
        switch (actionId) {
            case 'main.toggle-drawer':
                if (InspectorView.instance().drawerVisible()) {
                    InspectorView.instance().closeDrawer();
                }
                else {
                    InspectorView.instance().showDrawer(true);
                }
                return true;
            case 'main.next-tab':
                InspectorView.instance().tabbedPane.selectNextTab();
                InspectorView.instance().tabbedPane.focus();
                return true;
            case 'main.previous-tab':
                InspectorView.instance().tabbedPane.selectPrevTab();
                InspectorView.instance().tabbedPane.focus();
                return true;
        }
        return false;
    }
}
export class InspectorViewTabDelegate {
    closeTabs(tabbedPane, ids) {
        tabbedPane.closeTabs(ids, true);
        // Log telemetry about the closure
        ids.forEach(id => {
            Host.userMetrics.panelClosed(id);
        });
    }
    moveToDrawer(tabId) {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.TabMovedToDrawer);
        ViewManager.instance().moveView(tabId, 'drawer-view');
    }
    moveToMainPanel(tabId) {
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.TabMovedToMainPanel);
        ViewManager.instance().moveView(tabId, 'panel');
    }
    onContextMenu(tabId, contextMenu) {
        // Special case for console, we don't show the movable context panel for this two tabs
        if (tabId === 'console' || tabId === 'console-view') {
            return;
        }
        const locationName = ViewManager.instance().locationNameForViewId(tabId);
        if (locationName === 'drawer-view') {
            contextMenu.defaultSection().appendItem(i18nString(UIStrings.moveToTop), this.moveToMainPanel.bind(this, tabId));
        }
        else {
            contextMenu.defaultSection().appendItem(i18nString(UIStrings.moveToBottom), this.moveToDrawer.bind(this, tabId));
        }
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["DrawerChange"] = "drawerchange";
})(Events || (Events = {}));
//# sourceMappingURL=InspectorView.js.map
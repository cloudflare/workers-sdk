/*
 * Copyright (C) 2010 Google Inc. All rights reserved.
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
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as IconButton from '../components/icon_button/icon_button.js';
import * as ARIAUtils from './ARIAUtils.js';
import { ContextMenu } from './ContextMenu.js';
import { Constraints, Size } from './Geometry.js';
import { Icon } from './Icon.js';
import { Toolbar } from './Toolbar.js';
import { Tooltip } from './Tooltip.js';
import { installDragHandle, invokeOnceAfterBatchUpdate } from './UIUtils.js';
import { VBox } from './Widget.js';
import { ZoomManager } from './ZoomManager.js';
import tabbedPaneStyles from './tabbedPane.css.legacy.js';
const UIStrings = {
    /**
    *@description The aria label for the button to open more tabs at the right tabbed pane in Elements tools
    */
    moreTabs: 'More tabs',
    /**
    *@description Text in Tabbed Pane
    *@example {tab} PH1
    */
    closeS: 'Close {PH1}',
    /**
    *@description Text to close something
    */
    close: 'Close',
    /**
    *@description Text on a menu option to close other drawers when right click on a drawer title
    */
    closeOthers: 'Close others',
    /**
    *@description Text on a menu option to close the drawer to the right when right click on a drawer title
    */
    closeTabsToTheRight: 'Close tabs to the right',
    /**
    *@description Text on a menu option to close all the drawers except Console when right click on a drawer title
    */
    closeAll: 'Close all',
    /**
    *@description Indicates that a tab contains a preview feature (i.e., a beta / experimental feature).
    */
    previewFeature: 'Preview feature',
};
const str_ = i18n.i18n.registerUIStrings('ui/legacy/TabbedPane.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class TabbedPane extends Common.ObjectWrapper.eventMixin(VBox) {
    headerElementInternal;
    headerContentsElement;
    tabSlider;
    tabsElement;
    contentElementInternal;
    tabs;
    tabsHistory;
    tabsById;
    currentTabLocked;
    autoSelectFirstItemOnShow;
    triggerDropDownTimeout;
    dropDownButton;
    currentDevicePixelRatio;
    shrinkableTabs;
    verticalTabLayout;
    closeableTabs;
    delegate;
    currentTab;
    sliderEnabled;
    placeholderElement;
    focusedPlaceholderElement;
    placeholderContainerElement;
    lastSelectedOverflowTab;
    overflowDisabled;
    measuredDropDownButtonWidth;
    leftToolbarInternal;
    rightToolbarInternal;
    allowTabReorder;
    automaticReorder;
    constructor() {
        super(true);
        this.registerRequiredCSS(tabbedPaneStyles);
        this.element.classList.add('tabbed-pane');
        this.contentElement.classList.add('tabbed-pane-shadow');
        this.contentElement.tabIndex = -1;
        this.setDefaultFocusedElement(this.contentElement);
        this.headerElementInternal = this.contentElement.createChild('div', 'tabbed-pane-header');
        this.headerContentsElement = this.headerElementInternal.createChild('div', 'tabbed-pane-header-contents');
        this.tabSlider = document.createElement('div');
        this.tabSlider.classList.add('tabbed-pane-tab-slider');
        this.tabsElement = this.headerContentsElement.createChild('div', 'tabbed-pane-header-tabs');
        this.tabsElement.setAttribute('role', 'tablist');
        this.tabsElement.addEventListener('keydown', this.keyDown.bind(this), false);
        this.contentElementInternal = this.contentElement.createChild('div', 'tabbed-pane-content');
        this.contentElementInternal.createChild('slot');
        this.tabs = [];
        this.tabsHistory = [];
        this.tabsById = new Map();
        this.currentTabLocked = false;
        this.autoSelectFirstItemOnShow = true;
        this.triggerDropDownTimeout = null;
        this.dropDownButton = this.createDropDownButton();
        this.currentDevicePixelRatio = window.devicePixelRatio;
        ZoomManager.instance().addEventListener("ZoomChanged" /* ZoomChanged */, this.zoomChanged, this);
        this.makeTabSlider();
    }
    setAccessibleName(name) {
        ARIAUtils.setAccessibleName(this.tabsElement, name);
    }
    setCurrentTabLocked(locked) {
        this.currentTabLocked = locked;
        this.headerElementInternal.classList.toggle('locked', this.currentTabLocked);
    }
    setAutoSelectFirstItemOnShow(autoSelect) {
        this.autoSelectFirstItemOnShow = autoSelect;
    }
    get visibleView() {
        return this.currentTab ? this.currentTab.view : null;
    }
    tabIds() {
        return this.tabs.map(tab => tab.id);
    }
    tabIndex(tabId) {
        return this.tabs.findIndex(tab => tab.id === tabId);
    }
    tabViews() {
        return this.tabs.map(tab => tab.view);
    }
    tabView(tabId) {
        const tab = this.tabsById.get(tabId);
        return tab ? tab.view : null;
    }
    get selectedTabId() {
        return this.currentTab ? this.currentTab.id : null;
    }
    setShrinkableTabs(shrinkableTabs) {
        this.shrinkableTabs = shrinkableTabs;
    }
    makeVerticalTabLayout() {
        this.verticalTabLayout = true;
        this.setTabSlider(false);
        this.contentElement.classList.add('vertical-tab-layout');
        this.invalidateConstraints();
    }
    setCloseableTabs(closeableTabs) {
        this.closeableTabs = closeableTabs;
    }
    focus() {
        if (this.visibleView) {
            this.visibleView.focus();
        }
        else {
            this.contentElement.focus();
        }
    }
    focusSelectedTabHeader() {
        const selectedTab = this.currentTab;
        if (selectedTab) {
            selectedTab.tabElement.focus();
        }
    }
    headerElement() {
        return this.headerElementInternal;
    }
    tabbedPaneContentElement() {
        return this.contentElementInternal;
    }
    isTabCloseable(id) {
        const tab = this.tabsById.get(id);
        return tab ? tab.isCloseable() : false;
    }
    setTabDelegate(delegate) {
        const tabs = this.tabs.slice();
        for (let i = 0; i < tabs.length; ++i) {
            tabs[i].setDelegate(delegate);
        }
        this.delegate = delegate;
    }
    appendTab(id, tabTitle, view, tabTooltip, userGesture, isCloseable, isPreviewFeature, index) {
        const closeable = typeof isCloseable === 'boolean' ? isCloseable : Boolean(this.closeableTabs);
        const tab = new TabbedPaneTab(this, id, tabTitle, closeable, Boolean(isPreviewFeature), view, tabTooltip);
        tab.setDelegate(this.delegate);
        console.assert(!this.tabsById.has(id), `Tabbed pane already contains a tab with id '${id}'`);
        this.tabsById.set(id, tab);
        if (index !== undefined) {
            this.tabs.splice(index, 0, tab);
        }
        else {
            this.tabs.push(tab);
        }
        this.tabsHistory.push(tab);
        if (this.tabsHistory[0] === tab && this.isShowing()) {
            this.selectTab(tab.id, userGesture);
        }
        this.updateTabElements();
    }
    closeTab(id, userGesture) {
        this.closeTabs([id], userGesture);
    }
    closeTabs(ids, userGesture) {
        if (ids.length === 0) {
            return;
        }
        const focused = this.hasFocus();
        for (let i = 0; i < ids.length; ++i) {
            this.innerCloseTab(ids[i], userGesture);
        }
        this.updateTabElements();
        if (this.tabsHistory.length) {
            this.selectTab(this.tabsHistory[0].id, false);
        }
        if (focused) {
            this.focus();
        }
    }
    innerCloseTab(id, userGesture) {
        const tab = this.tabsById.get(id);
        if (!tab) {
            return;
        }
        if (userGesture && !tab.closeable) {
            return;
        }
        if (this.currentTab && this.currentTab.id === id) {
            this.hideCurrentTab();
        }
        this.tabsById.delete(id);
        this.tabsHistory.splice(this.tabsHistory.indexOf(tab), 1);
        this.tabs.splice(this.tabs.indexOf(tab), 1);
        if (tab.shown) {
            this.hideTabElement(tab);
        }
        const eventData = { prevTabId: undefined, tabId: id, view: tab.view, isUserGesture: userGesture };
        this.dispatchEventToListeners(Events.TabClosed, eventData);
        return true;
    }
    hasTab(tabId) {
        return this.tabsById.has(tabId);
    }
    otherTabs(id) {
        const result = [];
        for (let i = 0; i < this.tabs.length; ++i) {
            if (this.tabs[i].id !== id) {
                result.push(this.tabs[i].id);
            }
        }
        return result;
    }
    tabsToTheRight(id) {
        let index = -1;
        for (let i = 0; i < this.tabs.length; ++i) {
            if (this.tabs[i].id === id) {
                index = i;
                break;
            }
        }
        if (index === -1) {
            return [];
        }
        return this.tabs.slice(index + 1).map(function (tab) {
            return tab.id;
        });
    }
    viewHasFocus() {
        if (this.visibleView && this.visibleView.hasFocus()) {
            return true;
        }
        const root = this.contentElement.getComponentRoot();
        return root instanceof Document && this.contentElement === root.activeElement;
    }
    selectTab(id, userGesture, forceFocus) {
        if (this.currentTabLocked) {
            return false;
        }
        const focused = this.viewHasFocus();
        const tab = this.tabsById.get(id);
        if (!tab) {
            return false;
        }
        const eventData = {
            prevTabId: this.currentTab ? this.currentTab.id : undefined,
            tabId: id,
            view: tab.view,
            isUserGesture: userGesture,
        };
        this.dispatchEventToListeners(Events.TabInvoked, eventData);
        if (this.currentTab && this.currentTab.id === id) {
            return true;
        }
        this.suspendInvalidations();
        this.hideCurrentTab();
        this.showTab(tab);
        this.resumeInvalidations();
        this.currentTab = tab;
        this.tabsHistory.splice(this.tabsHistory.indexOf(tab), 1);
        this.tabsHistory.splice(0, 0, tab);
        this.updateTabElements();
        if (focused || forceFocus) {
            this.focus();
        }
        this.dispatchEventToListeners(Events.TabSelected, eventData);
        return true;
    }
    selectNextTab() {
        const index = this.tabs.indexOf(this.currentTab);
        const nextIndex = Platform.NumberUtilities.mod(index + 1, this.tabs.length);
        this.selectTab(this.tabs[nextIndex].id, true);
    }
    selectPrevTab() {
        const index = this.tabs.indexOf(this.currentTab);
        const nextIndex = Platform.NumberUtilities.mod(index - 1, this.tabs.length);
        this.selectTab(this.tabs[nextIndex].id, true);
    }
    lastOpenedTabIds(tabsCount) {
        function tabToTabId(tab) {
            return tab.id;
        }
        return this.tabsHistory.slice(0, tabsCount).map(tabToTabId);
    }
    setTabIcon(id, icon) {
        const tab = this.tabsById.get(id);
        if (!tab) {
            return;
        }
        tab.setIcon(icon);
        this.updateTabElements();
    }
    setTabEnabled(id, enabled) {
        const tab = this.tabsById.get(id);
        if (tab) {
            tab.tabElement.classList.toggle('disabled', !enabled);
        }
    }
    toggleTabClass(id, className, force) {
        const tab = this.tabsById.get(id);
        if (tab && tab.toggleClass(className, force)) {
            this.updateTabElements();
        }
    }
    zoomChanged() {
        this.clearMeasuredWidths();
        if (this.isShowing()) {
            this.updateTabElements();
        }
    }
    clearMeasuredWidths() {
        for (let i = 0; i < this.tabs.length; ++i) {
            delete this.tabs[i].measuredWidth;
        }
    }
    changeTabTitle(id, tabTitle, tabTooltip) {
        const tab = this.tabsById.get(id);
        if (tab && tabTooltip !== undefined) {
            tab.tooltip = tabTooltip;
        }
        if (tab && tab.title !== tabTitle) {
            tab.title = tabTitle;
            ARIAUtils.setAccessibleName(tab.tabElement, tabTitle);
            this.updateTabElements();
        }
    }
    changeTabView(id, view) {
        const tab = this.tabsById.get(id);
        if (!tab || tab.view === view) {
            return;
        }
        this.suspendInvalidations();
        const isSelected = this.currentTab && this.currentTab.id === id;
        const shouldFocus = tab.view.hasFocus();
        if (isSelected) {
            this.hideTab(tab);
        }
        tab.view = view;
        if (isSelected) {
            this.showTab(tab);
        }
        if (shouldFocus) {
            tab.view.focus();
        }
        this.resumeInvalidations();
    }
    onResize() {
        if (this.currentDevicePixelRatio !== window.devicePixelRatio) {
            // Force recalculation of all tab widths on a DPI change
            this.clearMeasuredWidths();
            this.currentDevicePixelRatio = window.devicePixelRatio;
        }
        this.updateTabElements();
    }
    headerResized() {
        this.updateTabElements();
    }
    wasShown() {
        const effectiveTab = this.currentTab || this.tabsHistory[0];
        if (effectiveTab && this.autoSelectFirstItemOnShow) {
            this.selectTab(effectiveTab.id);
        }
    }
    makeTabSlider() {
        if (this.verticalTabLayout) {
            return;
        }
        this.setTabSlider(true);
    }
    setTabSlider(enable) {
        this.sliderEnabled = enable;
        this.tabSlider.classList.toggle('enabled', enable);
    }
    calculateConstraints() {
        let constraints = super.calculateConstraints();
        const minContentConstraints = new Constraints(new Size(0, 0), new Size(50, 50));
        constraints = constraints.widthToMax(minContentConstraints).heightToMax(minContentConstraints);
        if (this.verticalTabLayout) {
            constraints = constraints.addWidth(new Constraints(new Size(120, 0)));
        }
        else {
            constraints = constraints.addHeight(new Constraints(new Size(0, 30)));
        }
        return constraints;
    }
    updateTabElements() {
        invokeOnceAfterBatchUpdate(this, this.innerUpdateTabElements);
    }
    setPlaceholderElement(element, focusedElement) {
        this.placeholderElement = element;
        if (focusedElement) {
            this.focusedPlaceholderElement = focusedElement;
        }
        if (this.placeholderContainerElement) {
            this.placeholderContainerElement.removeChildren();
            this.placeholderContainerElement.appendChild(element);
        }
    }
    async waitForTabElementUpdate() {
        this.innerUpdateTabElements();
    }
    innerUpdateTabElements() {
        if (!this.isShowing()) {
            return;
        }
        if (!this.tabs.length) {
            this.contentElementInternal.classList.add('has-no-tabs');
            if (this.placeholderElement && !this.placeholderContainerElement) {
                this.placeholderContainerElement =
                    this.contentElementInternal.createChild('div', 'tabbed-pane-placeholder fill');
                this.placeholderContainerElement.appendChild(this.placeholderElement);
                if (this.focusedPlaceholderElement) {
                    this.setDefaultFocusedElement(this.focusedPlaceholderElement);
                }
            }
        }
        else {
            this.contentElementInternal.classList.remove('has-no-tabs');
            if (this.placeholderContainerElement) {
                this.placeholderContainerElement.remove();
                this.setDefaultFocusedElement(this.contentElement);
                delete this.placeholderContainerElement;
            }
        }
        this.measureDropDownButton();
        this.adjustToolbarWidth();
        this.updateWidths();
        this.updateTabsDropDown();
        this.updateTabSlider();
    }
    adjustToolbarWidth() {
        if (!this.rightToolbarInternal || !this.measuredDropDownButtonWidth) {
            return;
        }
        const leftToolbarWidth = this.leftToolbarInternal?.element.getBoundingClientRect().width ?? 0;
        const rightToolbarWidth = this.rightToolbarInternal.element.getBoundingClientRect().width;
        const totalWidth = this.headerElementInternal.getBoundingClientRect().width;
        if (!this.rightToolbarInternal.hasCompactLayout() &&
            totalWidth - rightToolbarWidth - leftToolbarWidth < this.measuredDropDownButtonWidth + 10) {
            this.rightToolbarInternal.setCompactLayout(true);
        }
        else if (this.rightToolbarInternal.hasCompactLayout() &&
            // Estimate the right toolbar size in non-compact mode as 2 times its compact size.
            totalWidth - 2 * rightToolbarWidth - leftToolbarWidth > this.measuredDropDownButtonWidth + 10) {
            this.rightToolbarInternal.setCompactLayout(false);
        }
    }
    showTabElement(index, tab) {
        if (index >= this.tabsElement.children.length) {
            this.tabsElement.appendChild(tab.tabElement);
        }
        else {
            this.tabsElement.insertBefore(tab.tabElement, this.tabsElement.children[index]);
        }
        tab.shown = true;
    }
    hideTabElement(tab) {
        this.tabsElement.removeChild(tab.tabElement);
        tab.shown = false;
    }
    createDropDownButton() {
        const dropDownContainer = document.createElement('div');
        dropDownContainer.classList.add('tabbed-pane-header-tabs-drop-down-container');
        const chevronIcon = Icon.create('largeicon-chevron', 'chevron-icon');
        ARIAUtils.markAsMenuButton(dropDownContainer);
        ARIAUtils.setAccessibleName(dropDownContainer, i18nString(UIStrings.moreTabs));
        dropDownContainer.tabIndex = 0;
        dropDownContainer.appendChild(chevronIcon);
        dropDownContainer.addEventListener('click', this.dropDownClicked.bind(this));
        dropDownContainer.addEventListener('keydown', this.dropDownKeydown.bind(this));
        dropDownContainer.addEventListener('mousedown', event => {
            if (event.which !== 1 || this.triggerDropDownTimeout) {
                return;
            }
            this.triggerDropDownTimeout = window.setTimeout(this.dropDownClicked.bind(this, event), 200);
        });
        return dropDownContainer;
    }
    dropDownClicked(ev) {
        const event = ev;
        if (event.which !== 1) {
            return;
        }
        if (this.triggerDropDownTimeout) {
            clearTimeout(this.triggerDropDownTimeout);
            this.triggerDropDownTimeout = null;
        }
        const rect = this.dropDownButton.getBoundingClientRect();
        const menu = new ContextMenu(event, {
            useSoftMenu: false,
            x: rect.left,
            y: rect.bottom,
        });
        for (const tab of this.tabs) {
            if (tab.shown) {
                continue;
            }
            if (this.numberOfTabsShown() === 0 && this.tabsHistory[0] === tab) {
                menu.defaultSection().appendCheckboxItem(tab.title, this.dropDownMenuItemSelected.bind(this, tab), /* checked */ true);
            }
            else {
                menu.defaultSection().appendItem(tab.title, this.dropDownMenuItemSelected.bind(this, tab));
            }
        }
        void menu.show();
    }
    dropDownKeydown(event) {
        if (isEnterOrSpaceKey(event)) {
            this.dropDownButton.click();
            event.consume(true);
        }
    }
    dropDownMenuItemSelected(tab) {
        this.lastSelectedOverflowTab = tab;
        this.selectTab(tab.id, true, true);
    }
    totalWidth() {
        return this.headerContentsElement.getBoundingClientRect().width;
    }
    numberOfTabsShown() {
        let numTabsShown = 0;
        for (const tab of this.tabs) {
            if (tab.shown) {
                numTabsShown++;
            }
        }
        return numTabsShown;
    }
    disableOverflowMenu() {
        this.overflowDisabled = true;
    }
    updateTabsDropDown() {
        const tabsToShowIndexes = this.tabsToShowIndexes(this.tabs, this.tabsHistory, this.totalWidth(), this.measuredDropDownButtonWidth || 0);
        if (this.lastSelectedOverflowTab && this.numberOfTabsShown() !== tabsToShowIndexes.length) {
            delete this.lastSelectedOverflowTab;
            this.updateTabsDropDown();
            return;
        }
        for (let i = 0; i < this.tabs.length; ++i) {
            if (this.tabs[i].shown && tabsToShowIndexes.indexOf(i) === -1) {
                this.hideTabElement(this.tabs[i]);
            }
        }
        for (let i = 0; i < tabsToShowIndexes.length; ++i) {
            const tab = this.tabs[tabsToShowIndexes[i]];
            if (!tab.shown) {
                this.showTabElement(i, tab);
            }
        }
        if (!this.overflowDisabled) {
            this.maybeShowDropDown(tabsToShowIndexes.length !== this.tabs.length);
        }
    }
    maybeShowDropDown(hasMoreTabs) {
        if (hasMoreTabs && !this.dropDownButton.parentElement) {
            this.headerContentsElement.appendChild(this.dropDownButton);
        }
        else if (!hasMoreTabs && this.dropDownButton.parentElement) {
            this.headerContentsElement.removeChild(this.dropDownButton);
        }
    }
    measureDropDownButton() {
        if (this.overflowDisabled || this.measuredDropDownButtonWidth) {
            return;
        }
        this.dropDownButton.classList.add('measuring');
        this.headerContentsElement.appendChild(this.dropDownButton);
        this.measuredDropDownButtonWidth = this.dropDownButton.getBoundingClientRect().width;
        this.headerContentsElement.removeChild(this.dropDownButton);
        this.dropDownButton.classList.remove('measuring');
    }
    updateWidths() {
        const measuredWidths = this.measureWidths();
        const maxWidth = this.shrinkableTabs ? this.calculateMaxWidth(measuredWidths.slice(), this.totalWidth()) : Number.MAX_VALUE;
        let i = 0;
        for (const tab of this.tabs) {
            tab.setWidth(this.verticalTabLayout ? -1 : Math.min(maxWidth, measuredWidths[i++]));
        }
    }
    measureWidths() {
        // Add all elements to measure into this.tabsElement
        this.tabsElement.style.setProperty('width', '2000px');
        const measuringTabElements = new Map();
        for (const tab of this.tabs) {
            if (typeof tab.measuredWidth === 'number') {
                continue;
            }
            const measuringTabElement = tab.createTabElement(true);
            measuringTabElements.set(measuringTabElement, tab);
            this.tabsElement.appendChild(measuringTabElement);
        }
        // Perform measurement
        for (const [measuringTabElement, tab] of measuringTabElements) {
            const width = measuringTabElement.getBoundingClientRect().width;
            tab.measuredWidth = Math.ceil(width);
        }
        // Nuke elements from the UI
        for (const measuringTabElement of measuringTabElements.keys()) {
            measuringTabElement.remove();
        }
        // Combine the results.
        const measuredWidths = [];
        for (const tab of this.tabs) {
            measuredWidths.push(tab.measuredWidth || 0);
        }
        this.tabsElement.style.removeProperty('width');
        return measuredWidths;
    }
    calculateMaxWidth(measuredWidths, totalWidth) {
        if (!measuredWidths.length) {
            return 0;
        }
        measuredWidths.sort(function (x, y) {
            return x - y;
        });
        let totalMeasuredWidth = 0;
        for (let i = 0; i < measuredWidths.length; ++i) {
            totalMeasuredWidth += measuredWidths[i];
        }
        if (totalWidth >= totalMeasuredWidth) {
            return measuredWidths[measuredWidths.length - 1];
        }
        let totalExtraWidth = 0;
        for (let i = measuredWidths.length - 1; i > 0; --i) {
            const extraWidth = measuredWidths[i] - measuredWidths[i - 1];
            totalExtraWidth += (measuredWidths.length - i) * extraWidth;
            if (totalWidth + totalExtraWidth >= totalMeasuredWidth) {
                return measuredWidths[i - 1] +
                    (totalWidth + totalExtraWidth - totalMeasuredWidth) / (measuredWidths.length - i);
            }
        }
        return totalWidth / measuredWidths.length;
    }
    tabsToShowIndexes(tabsOrdered, tabsHistory, totalWidth, measuredDropDownButtonWidth) {
        const tabsToShowIndexes = [];
        let totalTabsWidth = 0;
        const tabCount = tabsOrdered.length;
        const tabsToLookAt = tabsOrdered.slice(0);
        if (this.currentTab !== undefined) {
            tabsToLookAt.unshift(tabsToLookAt.splice(tabsToLookAt.indexOf(this.currentTab), 1)[0]);
        }
        if (this.lastSelectedOverflowTab !== undefined) {
            tabsToLookAt.unshift(tabsToLookAt.splice(tabsToLookAt.indexOf(this.lastSelectedOverflowTab), 1)[0]);
        }
        for (let i = 0; i < tabCount; ++i) {
            const tab = this.automaticReorder ? tabsHistory[i] : tabsToLookAt[i];
            totalTabsWidth += tab.width();
            let minimalRequiredWidth = totalTabsWidth;
            if (i !== tabCount - 1) {
                minimalRequiredWidth += measuredDropDownButtonWidth;
            }
            if (!this.verticalTabLayout && minimalRequiredWidth > totalWidth) {
                break;
            }
            tabsToShowIndexes.push(tabsOrdered.indexOf(tab));
        }
        tabsToShowIndexes.sort(function (x, y) {
            return x - y;
        });
        return tabsToShowIndexes;
    }
    hideCurrentTab() {
        if (!this.currentTab) {
            return;
        }
        this.hideTab(this.currentTab);
        delete this.currentTab;
    }
    showTab(tab) {
        tab.tabElement.tabIndex = 0;
        tab.tabElement.classList.add('selected');
        ARIAUtils.setSelected(tab.tabElement, true);
        tab.view.show(this.element);
        this.updateTabSlider();
    }
    updateTabSlider() {
        if (!this.sliderEnabled) {
            return;
        }
        if (!this.currentTab) {
            this.tabSlider.style.width = '0';
            return;
        }
        let left = 0;
        for (let i = 0; i < this.tabs.length && this.currentTab !== this.tabs[i]; i++) {
            if (this.tabs[i].shown) {
                left += this.tabs[i].measuredWidth || 0;
            }
        }
        const sliderWidth = this.currentTab.shown ? this.currentTab.measuredWidth : this.dropDownButton.offsetWidth;
        const scaleFactor = window.devicePixelRatio >= 1.5 ? ' scaleY(0.75)' : '';
        this.tabSlider.style.transform = 'translateX(' + left + 'px)' + scaleFactor;
        this.tabSlider.style.width = sliderWidth + 'px';
        if (this.tabSlider.parentElement !== this.headerContentsElement) {
            this.headerContentsElement.appendChild(this.tabSlider);
        }
    }
    hideTab(tab) {
        tab.tabElement.removeAttribute('tabIndex');
        tab.tabElement.classList.remove('selected');
        tab.tabElement.setAttribute('aria-selected', 'false');
        tab.view.detach();
    }
    elementsToRestoreScrollPositionsFor() {
        return [this.contentElementInternal];
    }
    insertBefore(tab, index) {
        this.tabsElement.insertBefore(tab.tabElement, this.tabsElement.childNodes[index]);
        const oldIndex = this.tabs.indexOf(tab);
        this.tabs.splice(oldIndex, 1);
        if (oldIndex < index) {
            --index;
        }
        this.tabs.splice(index, 0, tab);
        const eventData = { prevTabId: undefined, tabId: tab.id, view: tab.view, isUserGesture: undefined };
        this.dispatchEventToListeners(Events.TabOrderChanged, eventData);
    }
    leftToolbar() {
        if (!this.leftToolbarInternal) {
            this.leftToolbarInternal = new Toolbar('tabbed-pane-left-toolbar');
            this.headerElementInternal.insertBefore(this.leftToolbarInternal.element, this.headerElementInternal.firstChild);
        }
        return this.leftToolbarInternal;
    }
    rightToolbar() {
        if (!this.rightToolbarInternal) {
            this.rightToolbarInternal = new Toolbar('tabbed-pane-right-toolbar');
            this.headerElementInternal.appendChild(this.rightToolbarInternal.element);
        }
        return this.rightToolbarInternal;
    }
    setAllowTabReorder(allow, automatic) {
        this.allowTabReorder = allow;
        this.automaticReorder = automatic;
    }
    keyDown(ev) {
        if (!this.currentTab) {
            return;
        }
        const event = ev;
        let nextTabElement = null;
        switch (event.key) {
            case 'ArrowUp':
            case 'ArrowLeft':
                nextTabElement = this.currentTab.tabElement.previousElementSibling;
                if (!nextTabElement && !this.dropDownButton.parentElement) {
                    nextTabElement = this.currentTab.tabElement.parentElement ?
                        this.currentTab.tabElement.parentElement.lastElementChild :
                        null;
                }
                break;
            case 'ArrowDown':
            case 'ArrowRight':
                nextTabElement = this.currentTab.tabElement.nextElementSibling;
                if (!nextTabElement && !this.dropDownButton.parentElement) {
                    nextTabElement = this.currentTab.tabElement.parentElement ?
                        this.currentTab.tabElement.parentElement.firstElementChild :
                        null;
                }
                break;
            case 'Enter':
            case ' ':
                this.currentTab.view.focus();
                return;
            default:
                return;
        }
        if (!nextTabElement) {
            this.dropDownButton.click();
            return;
        }
        const tab = this.tabs.find(tab => tab.tabElement === nextTabElement);
        if (tab) {
            this.selectTab(tab.id, true);
        }
        nextTabElement.focus();
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["TabInvoked"] = "TabInvoked";
    Events["TabSelected"] = "TabSelected";
    Events["TabClosed"] = "TabClosed";
    Events["TabOrderChanged"] = "TabOrderChanged";
})(Events || (Events = {}));
export class TabbedPaneTab {
    closeable;
    previewFeature = false;
    tabbedPane;
    idInternal;
    titleInternal;
    tooltipInternal;
    viewInternal;
    shown;
    measuredWidth;
    tabElementInternal;
    iconContainer;
    icon;
    widthInternal;
    delegate;
    titleElement;
    dragStartX;
    constructor(tabbedPane, id, title, closeable, previewFeature, view, tooltip) {
        this.closeable = closeable;
        this.previewFeature = previewFeature;
        this.tabbedPane = tabbedPane;
        this.idInternal = id;
        this.titleInternal = title;
        this.tooltipInternal = tooltip;
        this.viewInternal = view;
        this.shown = false;
        this.iconContainer = null;
    }
    get id() {
        return this.idInternal;
    }
    get title() {
        return this.titleInternal;
    }
    set title(title) {
        if (title === this.titleInternal) {
            return;
        }
        this.titleInternal = title;
        if (this.titleElement) {
            this.titleElement.textContent = title;
            const closeIconContainer = this.tabElementInternal?.querySelector('.close-button');
            closeIconContainer?.setAttribute('title', i18nString(UIStrings.closeS, { PH1: title }));
            closeIconContainer?.setAttribute('aria-label', i18nString(UIStrings.closeS, { PH1: title }));
        }
        delete this.measuredWidth;
    }
    isCloseable() {
        return this.closeable;
    }
    setIcon(icon) {
        this.icon = icon;
        if (this.tabElementInternal && this.titleElement) {
            this.createIconElement(this.tabElementInternal, this.titleElement, false);
        }
        delete this.measuredWidth;
    }
    toggleClass(className, force) {
        const element = this.tabElement;
        const hasClass = element.classList.contains(className);
        if (hasClass === force) {
            return false;
        }
        element.classList.toggle(className, force);
        delete this.measuredWidth;
        return true;
    }
    get view() {
        return this.viewInternal;
    }
    set view(view) {
        this.viewInternal = view;
    }
    get tooltip() {
        return this.tooltipInternal;
    }
    set tooltip(tooltip) {
        this.tooltipInternal = tooltip;
        if (this.titleElement) {
            Tooltip.install(this.titleElement, tooltip || '');
        }
    }
    get tabElement() {
        if (!this.tabElementInternal) {
            this.tabElementInternal = this.createTabElement(false);
        }
        return this.tabElementInternal;
    }
    width() {
        return this.widthInternal || 0;
    }
    setWidth(width) {
        this.tabElement.style.width = width === -1 ? '' : (width + 'px');
        this.widthInternal = width;
    }
    setDelegate(delegate) {
        this.delegate = delegate;
    }
    createIconElement(tabElement, titleElement, measuring) {
        const iconElement = tabIcons.get(tabElement);
        if (iconElement) {
            iconElement.remove();
            tabIcons.delete(tabElement);
        }
        if (!this.icon) {
            return;
        }
        const iconContainer = document.createElement('span');
        iconContainer.classList.add('tabbed-pane-header-tab-icon');
        const iconNode = measuring ? this.icon.cloneNode(true) : this.icon;
        iconContainer.appendChild(iconNode);
        tabElement.insertBefore(iconContainer, titleElement);
        tabIcons.set(tabElement, iconContainer);
    }
    createTabElement(measuring) {
        const tabElement = document.createElement('div');
        tabElement.classList.add('tabbed-pane-header-tab');
        tabElement.id = 'tab-' + this.idInternal;
        ARIAUtils.markAsTab(tabElement);
        ARIAUtils.setSelected(tabElement, false);
        ARIAUtils.setAccessibleName(tabElement, this.title);
        const titleElement = tabElement.createChild('span', 'tabbed-pane-header-tab-title');
        titleElement.textContent = this.title;
        Tooltip.install(titleElement, this.tooltip || '');
        this.createIconElement(tabElement, titleElement, measuring);
        if (!measuring) {
            this.titleElement = titleElement;
        }
        if (this.previewFeature) {
            const previewIcon = this.createPreviewIcon();
            tabElement.appendChild(previewIcon);
            tabElement.classList.add('preview');
        }
        if (this.closeable) {
            const closeIcon = this.createCloseIconButton();
            tabElement.appendChild(closeIcon);
            tabElement.classList.add('closeable');
        }
        if (measuring) {
            tabElement.classList.add('measuring');
        }
        else {
            tabElement.addEventListener('click', this.tabClicked.bind(this), false);
            tabElement.addEventListener('auxclick', this.tabClicked.bind(this), false);
            tabElement.addEventListener('mousedown', this.tabMouseDown.bind(this), false);
            tabElement.addEventListener('mouseup', this.tabMouseUp.bind(this), false);
            tabElement.addEventListener('contextmenu', this.tabContextMenu.bind(this), false);
            if (this.tabbedPane.allowTabReorder) {
                installDragHandle(tabElement, this.startTabDragging.bind(this), this.tabDragging.bind(this), this.endTabDragging.bind(this), null, null, 200);
            }
        }
        return tabElement;
    }
    createCloseIconButton() {
        const closeIconContainer = document.createElement('div');
        closeIconContainer.classList.add('close-button', 'tabbed-pane-close-button');
        const closeIcon = new IconButton.Icon.Icon();
        closeIcon.data = {
            iconName: 'close-icon',
            color: 'var(--tabbed-pane-close-icon-color)',
            width: '7px',
        };
        closeIconContainer.appendChild(closeIcon);
        closeIconContainer.setAttribute('role', 'button');
        closeIconContainer.setAttribute('title', i18nString(UIStrings.closeS, { PH1: this.title }));
        closeIconContainer.setAttribute('aria-label', i18nString(UIStrings.closeS, { PH1: this.title }));
        return closeIconContainer;
    }
    createPreviewIcon() {
        const previewIcon = document.createElement('div');
        previewIcon.classList.add('preview-icon');
        const closeIcon = new IconButton.Icon.Icon();
        closeIcon.data = {
            iconName: 'ic_preview_feature',
            color: 'var(--override-tabbed-pane-preview-icon-color)',
            width: '14px',
        };
        previewIcon.appendChild(closeIcon);
        previewIcon.setAttribute('title', i18nString(UIStrings.previewFeature));
        previewIcon.setAttribute('aria-label', i18nString(UIStrings.previewFeature));
        return previewIcon;
    }
    isCloseIconClicked(element) {
        return element?.classList.contains('tabbed-pane-close-button') ||
            element?.parentElement?.classList.contains('tabbed-pane-close-button') || false;
    }
    tabClicked(ev) {
        const event = ev;
        const middleButton = event.button === 1;
        const shouldClose = this.closeable && (middleButton || this.isCloseIconClicked(event.target));
        if (!shouldClose) {
            this.tabbedPane.focus();
            return;
        }
        this.closeTabs([this.id]);
        event.consume(true);
    }
    tabMouseDown(ev) {
        const event = ev;
        if (this.isCloseIconClicked(event.target) || event.button !== 0) {
            return;
        }
        this.tabbedPane.selectTab(this.id, true);
    }
    tabMouseUp(ev) {
        const event = ev;
        // This is needed to prevent middle-click pasting on linux when tabs are clicked.
        if (event.button === 1) {
            event.consume(true);
        }
    }
    closeTabs(ids) {
        if (this.delegate) {
            this.delegate.closeTabs(this.tabbedPane, ids);
            return;
        }
        this.tabbedPane.closeTabs(ids, true);
    }
    tabContextMenu(event) {
        function close() {
            this.closeTabs([this.id]);
        }
        function closeOthers() {
            this.closeTabs(this.tabbedPane.otherTabs(this.id));
        }
        function closeAll() {
            this.closeTabs(this.tabbedPane.tabIds());
        }
        function closeToTheRight() {
            this.closeTabs(this.tabbedPane.tabsToTheRight(this.id));
        }
        const contextMenu = new ContextMenu(event);
        if (this.closeable) {
            contextMenu.defaultSection().appendItem(i18nString(UIStrings.close), close.bind(this));
            contextMenu.defaultSection().appendItem(i18nString(UIStrings.closeOthers), closeOthers.bind(this));
            contextMenu.defaultSection().appendItem(i18nString(UIStrings.closeTabsToTheRight), closeToTheRight.bind(this));
            contextMenu.defaultSection().appendItem(i18nString(UIStrings.closeAll), closeAll.bind(this));
        }
        if (this.delegate) {
            this.delegate.onContextMenu(this.id, contextMenu);
        }
        void contextMenu.show();
    }
    startTabDragging(ev) {
        const event = ev;
        if (this.isCloseIconClicked(event.target)) {
            return false;
        }
        this.dragStartX = event.pageX;
        if (this.tabElementInternal) {
            this.tabElementInternal.classList.add('dragging');
        }
        this.tabbedPane.tabSlider.remove();
        return true;
    }
    tabDragging(ev) {
        const event = ev;
        const tabElements = this.tabbedPane.tabsElement.childNodes;
        for (let i = 0; i < tabElements.length; ++i) {
            let tabElement = tabElements[i];
            if (!this.tabElementInternal || tabElement === this.tabElementInternal) {
                continue;
            }
            const intersects = tabElement.offsetLeft + tabElement.clientWidth > this.tabElementInternal.offsetLeft &&
                this.tabElementInternal.offsetLeft + this.tabElementInternal.clientWidth > tabElement.offsetLeft;
            if (!intersects) {
                continue;
            }
            const dragStartX = this.dragStartX;
            if (Math.abs(event.pageX - dragStartX) < tabElement.clientWidth / 2 + 5) {
                break;
            }
            if (event.pageX - dragStartX > 0) {
                tabElement = tabElement.nextSibling;
                ++i;
            }
            const oldOffsetLeft = this.tabElementInternal.offsetLeft;
            this.tabbedPane.insertBefore(this, i);
            this.dragStartX = dragStartX + this.tabElementInternal.offsetLeft - oldOffsetLeft;
            break;
        }
        const dragStartX = this.dragStartX;
        const tabElement = this.tabElementInternal;
        if (!tabElement.previousSibling && event.pageX - dragStartX < 0) {
            tabElement.style.setProperty('left', '0px');
            return;
        }
        if (!tabElement.nextSibling && event.pageX - dragStartX > 0) {
            tabElement.style.setProperty('left', '0px');
            return;
        }
        tabElement.style.setProperty('left', (event.pageX - dragStartX) + 'px');
    }
    endTabDragging(_event) {
        const tabElement = this.tabElementInternal;
        tabElement.classList.remove('dragging');
        tabElement.style.removeProperty('left');
        delete this.dragStartX;
        this.tabbedPane.updateTabSlider();
    }
}
const tabIcons = new WeakMap();
//# sourceMappingURL=TabbedPane.js.map
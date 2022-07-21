// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as ARIAUtils from './ARIAUtils.js';
import { Icon } from './Icon.js';
import { Events as TabbedPaneEvents, TabbedPane } from './TabbedPane.js';
import { Toolbar, ToolbarMenuButton } from './Toolbar.js';
import { createTextChild } from './UIUtils.js';
import { getRegisteredLocationResolvers, getRegisteredViewExtensions, maybeRemoveViewExtension, registerLocationResolver, registerViewExtension, ViewLocationCategoryValues, resetViewRegistration, } from './ViewRegistration.js';
import { VBox } from './Widget.js';
import viewContainersStyles from './viewContainers.css.legacy.js';
const UIStrings = {
    /**
    *@description Aria label for the tab panel view container
    *@example {Sensors} PH1
    */
    sPanel: '{PH1} panel',
};
const str_ = i18n.i18n.registerUIStrings('ui/legacy/ViewManager.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export const defaultOptionsForTabs = {
    security: true,
};
export class PreRegisteredView {
    viewRegistration;
    widgetRequested;
    constructor(viewRegistration) {
        this.viewRegistration = viewRegistration;
        this.widgetRequested = false;
    }
    title() {
        return this.viewRegistration.title();
    }
    commandPrompt() {
        return this.viewRegistration.commandPrompt();
    }
    isCloseable() {
        return this.viewRegistration.persistence === "closeable" /* CLOSEABLE */;
    }
    isPreviewFeature() {
        return Boolean(this.viewRegistration.isPreviewFeature);
    }
    isTransient() {
        return this.viewRegistration.persistence === "transient" /* TRANSIENT */;
    }
    viewId() {
        return this.viewRegistration.id;
    }
    location() {
        return this.viewRegistration.location;
    }
    order() {
        return this.viewRegistration.order;
    }
    settings() {
        return this.viewRegistration.settings;
    }
    tags() {
        if (this.viewRegistration.tags) {
            // Get localized keys and separate by null character to prevent fuzzy matching from matching across them.
            return this.viewRegistration.tags.map(tag => tag()).join('\0');
        }
        return undefined;
    }
    persistence() {
        return this.viewRegistration.persistence;
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async toolbarItems() {
        if (this.viewRegistration.hasToolbar) {
            // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return this.widget().then(widget => widget.toolbarItems());
        }
        return [];
    }
    async widget() {
        this.widgetRequested = true;
        return this.viewRegistration.loadView();
    }
    async disposeView() {
        if (!this.widgetRequested) {
            return;
        }
        const widget = await this.widget();
        await widget.ownerViewDisposed();
    }
    experiment() {
        return this.viewRegistration.experiment;
    }
    condition() {
        return this.viewRegistration.condition;
    }
}
let viewManagerInstance;
export class ViewManager {
    views;
    locationNameByViewId;
    locationOverrideSetting;
    constructor() {
        this.views = new Map();
        this.locationNameByViewId = new Map();
        // Read override setting for location
        this.locationOverrideSetting = Common.Settings.Settings.instance().createSetting('viewsLocationOverride', {});
        const preferredExtensionLocations = this.locationOverrideSetting.get();
        // Views may define their initial ordering within a location. When the user has not reordered, we use the
        // default ordering as defined by the views themselves.
        const viewsByLocation = new Map();
        for (const view of getRegisteredViewExtensions()) {
            const location = view.location() || 'none';
            const views = viewsByLocation.get(location) || [];
            views.push(view);
            viewsByLocation.set(location, views);
        }
        let sortedViewExtensions = [];
        for (const views of viewsByLocation.values()) {
            views.sort((firstView, secondView) => {
                const firstViewOrder = firstView.order();
                const secondViewOrder = secondView.order();
                if (firstViewOrder !== undefined && secondViewOrder !== undefined) {
                    return firstViewOrder - secondViewOrder;
                }
                return 0;
            });
            sortedViewExtensions = sortedViewExtensions.concat(views);
        }
        for (const view of sortedViewExtensions) {
            const viewId = view.viewId();
            const location = view.location();
            if (this.views.has(viewId)) {
                throw new Error(`Duplicate view id '${viewId}'`);
            }
            this.views.set(viewId, view);
            // Use the preferred user location if available
            const locationName = preferredExtensionLocations[viewId] || location;
            this.locationNameByViewId.set(viewId, locationName);
        }
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!viewManagerInstance || forceNew) {
            viewManagerInstance = new ViewManager();
        }
        return viewManagerInstance;
    }
    static removeInstance() {
        viewManagerInstance = undefined;
    }
    static createToolbar(toolbarItems) {
        if (!toolbarItems.length) {
            return null;
        }
        const toolbar = new Toolbar('');
        for (const item of toolbarItems) {
            toolbar.appendToolbarItem(item);
        }
        return toolbar.element;
    }
    locationNameForViewId(viewId) {
        const locationName = this.locationNameByViewId.get(viewId);
        if (!locationName) {
            throw new Error(`No location name for view with id ${viewId}`);
        }
        return locationName;
    }
    /**
     * Moves a view to a new location
     */
    moveView(viewId, locationName, options) {
        const defaultOptions = { shouldSelectTab: true, overrideSaving: false };
        const { shouldSelectTab, overrideSaving } = options || defaultOptions;
        if (!viewId || !locationName) {
            return;
        }
        const view = this.view(viewId);
        if (!view) {
            return;
        }
        if (!overrideSaving) {
            // Update the inner map of locations
            this.locationNameByViewId.set(viewId, locationName);
            // Update the settings of location overwrites
            const locations = this.locationOverrideSetting.get();
            locations[viewId] = locationName;
            this.locationOverrideSetting.set(locations);
        }
        // Find new location and show view there
        void this.resolveLocation(locationName).then(location => {
            if (!location) {
                throw new Error('Move view: Could not resolve location for view: ' + viewId);
            }
            location.reveal();
            return location.showView(view, undefined, /* userGesture*/ true, /* omitFocus*/ false, shouldSelectTab);
        });
    }
    revealView(view) {
        const location = locationForView.get(view);
        if (!location) {
            return Promise.resolve();
        }
        location.reveal();
        return location.showView(view);
    }
    /**
     * Show view in location
     */
    showViewInLocation(viewId, locationName, shouldSelectTab = true) {
        this.moveView(viewId, locationName, {
            shouldSelectTab,
            overrideSaving: true,
        });
    }
    view(viewId) {
        const view = this.views.get(viewId);
        if (!view) {
            throw new Error(`No view with id ${viewId} found!`);
        }
        return view;
    }
    materializedWidget(viewId) {
        const view = this.view(viewId);
        if (!view) {
            return null;
        }
        return widgetForView.get(view) || null;
    }
    showView(viewId, userGesture, omitFocus) {
        const view = this.views.get(viewId);
        if (!view) {
            console.error('Could not find view for id: \'' + viewId + '\' ' + new Error().stack);
            return Promise.resolve();
        }
        const locationName = this.locationNameByViewId.get(viewId);
        const location = locationForView.get(view);
        if (location) {
            location.reveal();
            return location.showView(view, undefined, userGesture, omitFocus);
        }
        return this.resolveLocation(locationName).then(location => {
            if (!location) {
                throw new Error('Could not resolve location for view: ' + viewId);
            }
            location.reveal();
            return location.showView(view, undefined, userGesture, omitFocus);
        });
    }
    async resolveLocation(location) {
        if (!location) {
            return Promise.resolve(null);
        }
        const registeredResolvers = getRegisteredLocationResolvers().filter(resolver => resolver.name === location);
        if (registeredResolvers.length > 1) {
            throw new Error('Duplicate resolver for location: ' + location);
        }
        if (registeredResolvers.length) {
            const resolver = await registeredResolvers[0].loadResolver();
            return resolver.resolveLocation(location);
        }
        throw new Error('Unresolved location: ' + location);
    }
    createTabbedLocation(revealCallback, location, restoreSelection, allowReorder, defaultTab) {
        return new _TabbedLocation(this, revealCallback, location, restoreSelection, allowReorder, defaultTab);
    }
    createStackLocation(revealCallback, location) {
        return new _StackLocation(this, revealCallback, location);
    }
    hasViewsForLocation(location) {
        return Boolean(this.viewsForLocation(location).length);
    }
    viewsForLocation(location) {
        const result = [];
        for (const [id, view] of this.views.entries()) {
            if (this.locationNameByViewId.get(id) === location) {
                result.push(view);
            }
        }
        return result;
    }
}
const widgetForView = new WeakMap();
export class ContainerWidget extends VBox {
    view;
    materializePromise;
    constructor(view) {
        super();
        this.element.classList.add('flex-auto', 'view-container', 'overflow-auto');
        this.view = view;
        this.element.tabIndex = -1;
        ARIAUtils.markAsTabpanel(this.element);
        ARIAUtils.setAccessibleName(this.element, i18nString(UIStrings.sPanel, { PH1: view.title() }));
        this.setDefaultFocusedElement(this.element);
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    materialize() {
        if (this.materializePromise) {
            return this.materializePromise;
        }
        const promises = [];
        // TODO(crbug.com/1006759): Transform to async-await
        promises.push(this.view.toolbarItems().then(toolbarItems => {
            const toolbarElement = ViewManager.createToolbar(toolbarItems);
            if (toolbarElement) {
                this.element.insertBefore(toolbarElement, this.element.firstChild);
            }
        }));
        promises.push(this.view.widget().then(widget => {
            // Move focus from |this| to loaded |widget| if any.
            const shouldFocus = this.element.hasFocus();
            this.setDefaultFocusedElement(null);
            widgetForView.set(this.view, widget);
            widget.show(this.element);
            if (shouldFocus) {
                widget.focus();
            }
        }));
        this.materializePromise = Promise.all(promises);
        return this.materializePromise;
    }
    wasShown() {
        void this.materialize().then(() => {
            const widget = widgetForView.get(this.view);
            if (widget) {
                widget.show(this.element);
                this.wasShownForTest();
            }
        });
    }
    wasShownForTest() {
        // This method is sniffed in tests.
    }
}
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
// eslint-disable-next-line @typescript-eslint/naming-convention
export class _ExpandableContainerWidget extends VBox {
    titleElement;
    titleExpandIcon;
    view;
    widget;
    materializePromise;
    constructor(view) {
        super(true);
        this.element.classList.add('flex-none');
        this.registerRequiredCSS(viewContainersStyles);
        this.titleElement = document.createElement('div');
        this.titleElement.classList.add('expandable-view-title');
        ARIAUtils.markAsTreeitem(this.titleElement);
        this.titleExpandIcon = Icon.create('smallicon-triangle-right', 'title-expand-icon');
        this.titleElement.appendChild(this.titleExpandIcon);
        const titleText = view.title();
        createTextChild(this.titleElement, titleText);
        ARIAUtils.setAccessibleName(this.titleElement, titleText);
        ARIAUtils.setExpanded(this.titleElement, false);
        this.titleElement.tabIndex = 0;
        self.onInvokeElement(this.titleElement, this.toggleExpanded.bind(this));
        this.titleElement.addEventListener('keydown', this.onTitleKeyDown.bind(this), false);
        this.contentElement.insertBefore(this.titleElement, this.contentElement.firstChild);
        ARIAUtils.setControls(this.titleElement, this.contentElement.createChild('slot'));
        this.view = view;
        expandableContainerForView.set(view, this);
    }
    wasShown() {
        if (this.widget && this.materializePromise) {
            void this.materializePromise.then(() => {
                if (this.titleElement.classList.contains('expanded') && this.widget) {
                    this.widget.show(this.element);
                }
            });
        }
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    materialize() {
        if (this.materializePromise) {
            return this.materializePromise;
        }
        // TODO(crbug.com/1006759): Transform to async-await
        const promises = [];
        promises.push(this.view.toolbarItems().then(toolbarItems => {
            const toolbarElement = ViewManager.createToolbar(toolbarItems);
            if (toolbarElement) {
                this.titleElement.appendChild(toolbarElement);
            }
        }));
        promises.push(this.view.widget().then(widget => {
            this.widget = widget;
            widgetForView.set(this.view, widget);
            widget.show(this.element);
        }));
        this.materializePromise = Promise.all(promises);
        return this.materializePromise;
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expand() {
        if (this.titleElement.classList.contains('expanded')) {
            return this.materialize();
        }
        this.titleElement.classList.add('expanded');
        ARIAUtils.setExpanded(this.titleElement, true);
        this.titleExpandIcon.setIconType('smallicon-triangle-down');
        return this.materialize().then(() => {
            if (this.widget) {
                this.widget.show(this.element);
            }
        });
    }
    collapse() {
        if (!this.titleElement.classList.contains('expanded')) {
            return;
        }
        this.titleElement.classList.remove('expanded');
        ARIAUtils.setExpanded(this.titleElement, false);
        this.titleExpandIcon.setIconType('smallicon-triangle-right');
        void this.materialize().then(() => {
            if (this.widget) {
                this.widget.detach();
            }
        });
    }
    toggleExpanded(event) {
        if (event.type === 'keydown' && event.target !== this.titleElement) {
            return;
        }
        if (this.titleElement.classList.contains('expanded')) {
            this.collapse();
        }
        else {
            void this.expand();
        }
    }
    onTitleKeyDown(event) {
        if (event.target !== this.titleElement) {
            return;
        }
        const keyEvent = event;
        if (keyEvent.key === 'ArrowLeft') {
            this.collapse();
        }
        else if (keyEvent.key === 'ArrowRight') {
            if (!this.titleElement.classList.contains('expanded')) {
                void this.expand();
            }
            else if (this.widget) {
                this.widget.focus();
            }
        }
    }
}
const expandableContainerForView = new WeakMap();
class Location {
    manager;
    revealCallback;
    widgetInternal;
    constructor(manager, widget, revealCallback) {
        this.manager = manager;
        this.revealCallback = revealCallback;
        this.widgetInternal = widget;
    }
    widget() {
        return this.widgetInternal;
    }
    reveal() {
        if (this.revealCallback) {
            this.revealCallback();
        }
    }
    showView(_view, _insertBefore, _userGesture, _omitFocus, _shouldSelectTab) {
        throw new Error('not implemented');
    }
    removeView(_view) {
        throw new Error('not implemented');
    }
}
const locationForView = new WeakMap();
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
// eslint-disable-next-line @typescript-eslint/naming-convention
export class _TabbedLocation extends Location {
    tabbedPaneInternal;
    allowReorder;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    closeableTabSetting;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tabOrderSetting;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastSelectedTabSetting;
    defaultTab;
    views;
    constructor(manager, revealCallback, location, restoreSelection, allowReorder, defaultTab) {
        const tabbedPane = new TabbedPane();
        if (allowReorder) {
            tabbedPane.setAllowTabReorder(true);
        }
        super(manager, tabbedPane, revealCallback);
        this.tabbedPaneInternal = tabbedPane;
        this.allowReorder = allowReorder;
        this.tabbedPaneInternal.addEventListener(TabbedPaneEvents.TabSelected, this.tabSelected, this);
        this.tabbedPaneInternal.addEventListener(TabbedPaneEvents.TabClosed, this.tabClosed, this);
        this.closeableTabSetting = Common.Settings.Settings.instance().createSetting('closeableTabs', {});
        // As we give tabs the capability to be closed we also need to add them to the setting so they are still open
        // until the user decide to close them
        this.setOrUpdateCloseableTabsSetting();
        this.tabOrderSetting = Common.Settings.Settings.instance().createSetting(location + '-tabOrder', {});
        this.tabbedPaneInternal.addEventListener(TabbedPaneEvents.TabOrderChanged, this.persistTabOrder, this);
        if (restoreSelection) {
            this.lastSelectedTabSetting = Common.Settings.Settings.instance().createSetting(location + '-selectedTab', '');
        }
        this.defaultTab = defaultTab;
        this.views = new Map();
        if (location) {
            this.appendApplicableItems(location);
        }
    }
    setOrUpdateCloseableTabsSetting() {
        // Update the setting value, we respect the closed state decided by the user
        // and append the new tabs with value of true so they are shown open
        const tabs = this.closeableTabSetting.get();
        const newClosable = Object.assign({
            ...defaultOptionsForTabs,
        }, tabs);
        this.closeableTabSetting.set(newClosable);
    }
    widget() {
        return this.tabbedPaneInternal;
    }
    tabbedPane() {
        return this.tabbedPaneInternal;
    }
    enableMoreTabsButton() {
        const moreTabsButton = new ToolbarMenuButton(this.appendTabsToMenu.bind(this));
        this.tabbedPaneInternal.leftToolbar().appendToolbarItem(moreTabsButton);
        this.tabbedPaneInternal.disableOverflowMenu();
        return moreTabsButton;
    }
    appendApplicableItems(locationName) {
        const views = this.manager.viewsForLocation(locationName);
        if (this.allowReorder) {
            let i = 0;
            const persistedOrders = this.tabOrderSetting.get();
            // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const orders = new Map();
            for (const view of views) {
                orders.set(view.viewId(), persistedOrders[view.viewId()] || (++i) * _TabbedLocation.orderStep);
            }
            views.sort((a, b) => orders.get(a.viewId()) - orders.get(b.viewId()));
        }
        for (const view of views) {
            const id = view.viewId();
            this.views.set(id, view);
            locationForView.set(view, this);
            if (view.isTransient()) {
                continue;
            }
            if (!view.isCloseable()) {
                this.appendTab(view);
            }
            else if (this.closeableTabSetting.get()[id]) {
                this.appendTab(view);
            }
        }
        // If a default tab was provided we open or select it
        if (this.defaultTab) {
            if (this.tabbedPaneInternal.hasTab(this.defaultTab)) {
                // If the tabbed pane already has the tab we just have to select it
                this.tabbedPaneInternal.selectTab(this.defaultTab);
            }
            else {
                // If the tab is not present already it can be because:
                // it doesn't correspond to this tabbed location
                // or because it is closed
                const view = Array.from(this.views.values()).find(view => view.viewId() === this.defaultTab);
                if (view) {
                    // defaultTab is indeed part of the views for this tabbed location
                    void this.showView(view);
                }
            }
        }
        else if (this.lastSelectedTabSetting && this.tabbedPaneInternal.hasTab(this.lastSelectedTabSetting.get())) {
            this.tabbedPaneInternal.selectTab(this.lastSelectedTabSetting.get());
        }
    }
    appendTabsToMenu(contextMenu) {
        const views = Array.from(this.views.values());
        views.sort((viewa, viewb) => viewa.title().localeCompare(viewb.title()));
        for (const view of views) {
            const title = view.title();
            if (view.viewId() === 'issues-pane') {
                contextMenu.defaultSection().appendItem(title, () => {
                    Host.userMetrics.issuesPanelOpenedFrom(Host.UserMetrics.IssueOpener.HamburgerMenu);
                    void this.showView(view, undefined, true);
                });
                continue;
            }
            contextMenu.defaultSection().appendItem(title, this.showView.bind(this, view, undefined, true));
        }
    }
    appendTab(view, index) {
        this.tabbedPaneInternal.appendTab(view.viewId(), view.title(), new ContainerWidget(view), undefined, false, view.isCloseable() || view.isTransient(), view.isPreviewFeature(), index);
    }
    appendView(view, insertBefore) {
        if (this.tabbedPaneInternal.hasTab(view.viewId())) {
            return;
        }
        const oldLocation = locationForView.get(view);
        if (oldLocation && oldLocation !== this) {
            oldLocation.removeView(view);
        }
        locationForView.set(view, this);
        this.manager.views.set(view.viewId(), view);
        this.views.set(view.viewId(), view);
        let index = undefined;
        const tabIds = this.tabbedPaneInternal.tabIds();
        if (this.allowReorder) {
            const orderSetting = this.tabOrderSetting.get();
            const order = orderSetting[view.viewId()];
            for (let i = 0; order && i < tabIds.length; ++i) {
                if (orderSetting[tabIds[i]] && orderSetting[tabIds[i]] > order) {
                    index = i;
                    break;
                }
            }
        }
        else if (insertBefore) {
            for (let i = 0; i < tabIds.length; ++i) {
                if (tabIds[i] === insertBefore.viewId()) {
                    index = i;
                    break;
                }
            }
        }
        this.appendTab(view, index);
        if (view.isCloseable()) {
            const tabs = this.closeableTabSetting.get();
            const tabId = view.viewId();
            if (!tabs[tabId]) {
                tabs[tabId] = true;
                this.closeableTabSetting.set(tabs);
            }
        }
        this.persistTabOrder();
    }
    async showView(view, insertBefore, userGesture, omitFocus, shouldSelectTab = true) {
        this.appendView(view, insertBefore);
        if (shouldSelectTab) {
            this.tabbedPaneInternal.selectTab(view.viewId(), userGesture);
        }
        if (!omitFocus) {
            this.tabbedPaneInternal.focus();
        }
        const widget = this.tabbedPaneInternal.tabView(view.viewId());
        await widget.materialize();
    }
    removeView(view) {
        if (!this.tabbedPaneInternal.hasTab(view.viewId())) {
            return;
        }
        locationForView.delete(view);
        this.manager.views.delete(view.viewId());
        this.tabbedPaneInternal.closeTab(view.viewId());
        this.views.delete(view.viewId());
    }
    tabSelected(event) {
        const { tabId } = event.data;
        if (this.lastSelectedTabSetting && event.data['isUserGesture']) {
            this.lastSelectedTabSetting.set(tabId);
        }
    }
    tabClosed(event) {
        const { tabId } = event.data;
        const tabs = this.closeableTabSetting.get();
        if (tabs[tabId]) {
            tabs[tabId] = false;
            this.closeableTabSetting.set(tabs);
        }
        const view = this.views.get(tabId);
        if (view) {
            void view.disposeView();
        }
    }
    persistTabOrder() {
        const tabIds = this.tabbedPaneInternal.tabIds();
        const tabOrders = {};
        for (let i = 0; i < tabIds.length; i++) {
            tabOrders[tabIds[i]] = (i + 1) * _TabbedLocation.orderStep;
        }
        const oldTabOrder = this.tabOrderSetting.get();
        const oldTabArray = Object.keys(oldTabOrder);
        oldTabArray.sort((a, b) => oldTabOrder[a] - oldTabOrder[b]);
        let lastOrder = 0;
        for (const key of oldTabArray) {
            if (key in tabOrders) {
                lastOrder = tabOrders[key];
                continue;
            }
            tabOrders[key] = ++lastOrder;
        }
        this.tabOrderSetting.set(tabOrders);
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getCloseableTabSetting() {
        return this.closeableTabSetting.get();
    }
    static orderStep = 10; // Keep in sync with descriptors.
}
// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
// eslint-disable-next-line @typescript-eslint/naming-convention
class _StackLocation extends Location {
    vbox;
    expandableContainers;
    constructor(manager, revealCallback, location) {
        const vbox = new VBox();
        super(manager, vbox, revealCallback);
        this.vbox = vbox;
        ARIAUtils.markAsTree(vbox.element);
        this.expandableContainers = new Map();
        if (location) {
            this.appendApplicableItems(location);
        }
    }
    appendView(view, insertBefore) {
        const oldLocation = locationForView.get(view);
        if (oldLocation && oldLocation !== this) {
            oldLocation.removeView(view);
        }
        let container = this.expandableContainers.get(view.viewId());
        if (!container) {
            locationForView.set(view, this);
            this.manager.views.set(view.viewId(), view);
            container = new _ExpandableContainerWidget(view);
            let beforeElement = null;
            if (insertBefore) {
                const beforeContainer = expandableContainerForView.get(insertBefore);
                beforeElement = beforeContainer ? beforeContainer.element : null;
            }
            container.show(this.vbox.contentElement, beforeElement);
            this.expandableContainers.set(view.viewId(), container);
        }
    }
    async showView(view, insertBefore) {
        this.appendView(view, insertBefore);
        const container = this.expandableContainers.get(view.viewId());
        if (container) {
            await container.expand();
        }
    }
    removeView(view) {
        const container = this.expandableContainers.get(view.viewId());
        if (!container) {
            return;
        }
        container.detach();
        this.expandableContainers.delete(view.viewId());
        locationForView.delete(view);
        this.manager.views.delete(view.viewId());
    }
    appendApplicableItems(locationName) {
        for (const view of this.manager.viewsForLocation(locationName)) {
            this.appendView(view);
        }
    }
}
export { getRegisteredViewExtensions, maybeRemoveViewExtension, registerViewExtension, getRegisteredLocationResolvers, registerLocationResolver, ViewLocationCategoryValues, resetViewRegistration, };
//# sourceMappingURL=ViewManager.js.map
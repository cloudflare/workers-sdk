// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as SourceFrame from '../../ui/legacy/components/source_frame/source_frame.js';
import * as UI from '../../ui/legacy/legacy.js';
import resourcesPanelStyles from './resourcesPanel.css.js';
import { ApplicationPanelSidebar, StorageCategoryView } from './ApplicationPanelSidebar.js';
import { CookieItemsView } from './CookieItemsView.js';
import { DatabaseQueryView } from './DatabaseQueryView.js';
import { DatabaseTableView } from './DatabaseTableView.js';
import { DOMStorageItemsView } from './DOMStorageItemsView.js';
import { StorageItemsView } from './StorageItemsView.js';
let resourcesPanelInstance;
export class ResourcesPanel extends UI.Panel.PanelWithSidebar {
    resourcesLastSelectedItemSetting;
    visibleView;
    pendingViewPromise;
    categoryView;
    storageViews;
    storageViewToolbar;
    domStorageView;
    cookieView;
    emptyWidget;
    sidebar;
    constructor() {
        super('resources');
        this.resourcesLastSelectedItemSetting =
            Common.Settings.Settings.instance().createSetting('resourcesLastSelectedElementPath', []);
        this.visibleView = null;
        this.pendingViewPromise = null;
        this.categoryView = null;
        const mainContainer = new UI.Widget.VBox();
        this.storageViews = mainContainer.element.createChild('div', 'vbox flex-auto');
        this.storageViewToolbar = new UI.Toolbar.Toolbar('resources-toolbar', mainContainer.element);
        this.splitWidget().setMainWidget(mainContainer);
        this.domStorageView = null;
        this.cookieView = null;
        this.emptyWidget = null;
        this.sidebar = new ApplicationPanelSidebar(this);
        this.sidebar.show(this.panelSidebarElement());
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!resourcesPanelInstance || forceNew) {
            resourcesPanelInstance = new ResourcesPanel();
        }
        return resourcesPanelInstance;
    }
    static shouldCloseOnReset(view) {
        const viewClassesToClose = [
            SourceFrame.ResourceSourceFrame.ResourceSourceFrame,
            SourceFrame.ImageView.ImageView,
            SourceFrame.FontView.FontView,
            StorageItemsView,
            DatabaseQueryView,
            DatabaseTableView,
        ];
        return viewClassesToClose.some(type => view instanceof type);
    }
    static async showAndGetSidebar() {
        await UI.ViewManager.ViewManager.instance().showView('resources');
        return ResourcesPanel.instance().sidebar;
    }
    focus() {
        this.sidebar.focus();
    }
    lastSelectedItemPath() {
        return this.resourcesLastSelectedItemSetting.get();
    }
    setLastSelectedItemPath(path) {
        this.resourcesLastSelectedItemSetting.set(path);
    }
    resetView() {
        if (this.visibleView && ResourcesPanel.shouldCloseOnReset(this.visibleView)) {
            this.showView(null);
        }
    }
    showView(view) {
        this.pendingViewPromise = null;
        if (this.visibleView === view) {
            return;
        }
        if (this.visibleView) {
            this.visibleView.detach();
        }
        if (view) {
            view.show(this.storageViews);
        }
        this.visibleView = view;
        this.storageViewToolbar.removeToolbarItems();
        this.storageViewToolbar.element.classList.toggle('hidden', true);
        if (view instanceof UI.View.SimpleView) {
            void view.toolbarItems().then(items => {
                items.map(item => this.storageViewToolbar.appendToolbarItem(item));
                this.storageViewToolbar.element.classList.toggle('hidden', !items.length);
            });
        }
    }
    async scheduleShowView(viewPromise) {
        this.pendingViewPromise = viewPromise;
        const view = await viewPromise;
        if (this.pendingViewPromise !== viewPromise) {
            return null;
        }
        this.showView(view);
        return view;
    }
    showCategoryView(categoryName, categoryLink) {
        if (!this.categoryView) {
            this.categoryView = new StorageCategoryView();
        }
        this.categoryView.setText(categoryName);
        this.categoryView.setLink(categoryLink);
        this.showView(this.categoryView);
    }
    showDOMStorage(domStorage) {
        if (!domStorage) {
            return;
        }
        if (!this.domStorageView) {
            this.domStorageView = new DOMStorageItemsView(domStorage);
        }
        else {
            this.domStorageView.setStorage(domStorage);
        }
        this.showView(this.domStorageView);
    }
    showCookies(cookieFrameTarget, cookieDomain) {
        const model = cookieFrameTarget.model(SDK.CookieModel.CookieModel);
        if (!model) {
            return;
        }
        if (!this.cookieView) {
            this.cookieView = new CookieItemsView(model, cookieDomain);
        }
        else {
            this.cookieView.setCookiesDomain(model, cookieDomain);
        }
        this.showView(this.cookieView);
    }
    clearCookies(target, cookieDomain) {
        const model = target.model(SDK.CookieModel.CookieModel);
        if (!model) {
            return;
        }
        void model.clear(cookieDomain).then(() => {
            if (this.cookieView) {
                this.cookieView.refreshItems();
            }
        });
    }
    wasShown() {
        super.wasShown();
        this.registerCSSFiles([resourcesPanelStyles]);
    }
}
let resourceRevealerInstance;
export class ResourceRevealer {
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!resourceRevealerInstance || forceNew) {
            resourceRevealerInstance = new ResourceRevealer();
        }
        return resourceRevealerInstance;
    }
    async reveal(resource) {
        if (!(resource instanceof SDK.Resource.Resource)) {
            throw new Error('Internal error: not a resource');
        }
        const sidebar = await ResourcesPanel.showAndGetSidebar();
        await sidebar.showResource(resource);
    }
}
let frameDetailsRevealerInstance;
export class FrameDetailsRevealer {
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!frameDetailsRevealerInstance || forceNew) {
            frameDetailsRevealerInstance = new FrameDetailsRevealer();
        }
        return frameDetailsRevealerInstance;
    }
    async reveal(frame) {
        if (!(frame instanceof SDK.ResourceTreeModel.ResourceTreeFrame)) {
            throw new Error('Internal error: not a frame');
        }
        const sidebar = await ResourcesPanel.showAndGetSidebar();
        sidebar.showFrame(frame);
    }
}
//# sourceMappingURL=ResourcesPanel.js.map
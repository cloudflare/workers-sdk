// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2007, 2008, 2010 Apple Inc.  All rights reserved.
 * Copyright (C) 2009 Joseph Pecoraro
 * Copyright (C) 2013 Samsung Electronics. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as SourceFrame from '../../ui/legacy/components/source_frame/source_frame.js';
import * as UI from '../../ui/legacy/legacy.js';
import { BackForwardCacheTreeElement, ServiceWorkerCacheTreeElement } from './ApplicationPanelCacheSection.js';
import { ApplicationPanelTreeElement, ExpandableApplicationPanelTreeElement } from './ApplicationPanelTreeElement.js';
import { AppManifestView } from './AppManifestView.js';
import { BackgroundServiceModel } from './BackgroundServiceModel.js';
import { BackgroundServiceView } from './BackgroundServiceView.js';
import * as ApplicationComponents from './components/components.js';
import resourcesSidebarStyles from './resourcesSidebar.css.js';
import { DatabaseModel, Events as DatabaseModelEvents } from './DatabaseModel.js';
import { DatabaseQueryView, Events as DatabaseQueryViewEvents } from './DatabaseQueryView.js';
import { DatabaseTableView } from './DatabaseTableView.js';
import { DOMStorageModel, Events as DOMStorageModelEvents } from './DOMStorageModel.js';
import { Events as IndexedDBModelEvents, IndexedDBModel } from './IndexedDBModel.js';
import { IDBDatabaseView, IDBDataView } from './IndexedDBViews.js';
import { InterestGroupStorageModel } from './InterestGroupStorageModel.js';
import { InterestGroupTreeElement } from './InterestGroupTreeElement.js';
import { OpenedWindowDetailsView, WorkerDetailsView } from './OpenedWindowDetailsView.js';
import { ServiceWorkersView } from './ServiceWorkersView.js';
import { StorageView } from './StorageView.js';
import { TrustTokensTreeElement } from './TrustTokensTreeElement.js';
import { ReportingApiTreeElement } from './ReportingApiTreeElement.js';
const UIStrings = {
    /**
    *@description Text in Application Panel Sidebar of the Application panel
    */
    application: 'Application',
    /**
    *@description Text in Application Panel Sidebar of the Application panel
    */
    storage: 'Storage',
    /**
    *@description Text in Application Panel Sidebar of the Application panel
    */
    localStorage: 'Local Storage',
    /**
    *@description Text in Application Panel Sidebar of the Application panel
    */
    sessionStorage: 'Session Storage',
    /**
    *@description Text in Application Panel Sidebar of the Application panel
    */
    webSql: 'Web SQL',
    /**
    *@description Text for web cookies
    */
    cookies: 'Cookies',
    /**
    *@description Text in Application Panel Sidebar of the Application panel
    */
    cache: 'Cache',
    /**
    *@description Text in Application Panel Sidebar of the Application panel
    */
    backgroundServices: 'Background Services',
    /**
    *@description Text for rendering frames
    */
    frames: 'Frames',
    /**
    *@description Text that appears on a button for the manifest resource type filter.
    */
    manifest: 'Manifest',
    /**
    *@description Text in Application Panel Sidebar of the Application panel
    */
    indexeddb: 'IndexedDB',
    /**
    *@description A context menu item in the Application Panel Sidebar of the Application panel
    */
    refreshIndexeddb: 'Refresh IndexedDB',
    /**
    *@description Tooltip in Application Panel Sidebar of the Application panel
    *@example {1.0} PH1
    */
    versionSEmpty: 'Version: {PH1} (empty)',
    /**
    *@description Tooltip in Application Panel Sidebar of the Application panel
    *@example {1.0} PH1
    */
    versionS: 'Version: {PH1}',
    /**
    *@description Text to clear content
    */
    clear: 'Clear',
    /**
    *@description Text in Application Panel Sidebar of the Application panel
    *@example {"key path"} PH1
    */
    keyPathS: 'Key path: {PH1}',
    /**
    *@description Text in Application Panel Sidebar of the Application panel
    */
    localFiles: 'Local Files',
    /**
    *@description Tooltip in Application Panel Sidebar of the Application panel
    *@example {https://example.com} PH1
    */
    cookiesUsedByFramesFromS: 'Cookies used by frames from {PH1}',
    /**
    *@description Text in Frames View of the Application panel
    */
    openedWindows: 'Opened Windows',
    /**
    *@description Label for plural of worker type: web workers
    */
    webWorkers: 'Web Workers',
    /**
    *@description Label in frame tree for unavailable document
    */
    documentNotAvailable: 'Document not available',
    /**
    *@description Description of content of unavailable document in Application panel
    */
    theContentOfThisDocumentHasBeen: 'The content of this document has been generated dynamically via \'document.write()\'.',
    /**
    *@description Text in Frames View of the Application panel
    */
    windowWithoutTitle: 'Window without title',
    /**
    *@description Default name for worker
    */
    worker: 'worker',
};
const str_ = i18n.i18n.registerUIStrings('panels/application/ApplicationPanelSidebar.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
function assertNotMainTarget(targetId) {
    if (targetId === 'main') {
        throw new Error('Unexpected main target id');
    }
}
export class ApplicationPanelSidebar extends UI.Widget.VBox {
    panel;
    sidebarTree;
    applicationTreeElement;
    serviceWorkersTreeElement;
    localStorageListTreeElement;
    sessionStorageListTreeElement;
    indexedDBListTreeElement;
    interestGroupTreeElement;
    databasesListTreeElement;
    cookieListTreeElement;
    trustTokensTreeElement;
    cacheStorageListTreeElement;
    backForwardCacheListTreeElement;
    backgroundFetchTreeElement;
    backgroundSyncTreeElement;
    notificationsTreeElement;
    paymentHandlerTreeElement;
    periodicBackgroundSyncTreeElement;
    pushMessagingTreeElement;
    reportingApiTreeElement;
    resourcesSection;
    databaseTableViews;
    databaseQueryViews;
    databaseTreeElements;
    domStorageTreeElements;
    domains;
    target;
    databaseModel;
    previousHoveredElement;
    constructor(panel) {
        super();
        this.panel = panel;
        this.sidebarTree = new UI.TreeOutline.TreeOutlineInShadow();
        this.sidebarTree.element.classList.add('resources-sidebar');
        this.sidebarTree.element.classList.add('filter-all');
        // Listener needs to have been set up before the elements are added
        this.sidebarTree.addEventListener(UI.TreeOutline.Events.ElementAttached, this.treeElementAdded, this);
        this.contentElement.appendChild(this.sidebarTree.element);
        const applicationSectionTitle = i18nString(UIStrings.application);
        this.applicationTreeElement = this.addSidebarSection(applicationSectionTitle);
        const manifestTreeElement = new AppManifestTreeElement(panel);
        this.applicationTreeElement.appendChild(manifestTreeElement);
        this.serviceWorkersTreeElement = new ServiceWorkersTreeElement(panel);
        this.applicationTreeElement.appendChild(this.serviceWorkersTreeElement);
        const clearStorageTreeElement = new ClearStorageTreeElement(panel);
        this.applicationTreeElement.appendChild(clearStorageTreeElement);
        const storageSectionTitle = i18nString(UIStrings.storage);
        const storageTreeElement = this.addSidebarSection(storageSectionTitle);
        this.localStorageListTreeElement =
            new ExpandableApplicationPanelTreeElement(panel, i18nString(UIStrings.localStorage), 'LocalStorage');
        this.localStorageListTreeElement.setLink('https://developer.chrome.com/docs/devtools/storage/localstorage/?utm_source=devtools');
        const localStorageIcon = UI.Icon.Icon.create('mediumicon-table', 'resource-tree-item');
        this.localStorageListTreeElement.setLeadingIcons([localStorageIcon]);
        storageTreeElement.appendChild(this.localStorageListTreeElement);
        this.sessionStorageListTreeElement =
            new ExpandableApplicationPanelTreeElement(panel, i18nString(UIStrings.sessionStorage), 'SessionStorage');
        this.sessionStorageListTreeElement.setLink('https://developer.chrome.com/docs/devtools/storage/sessionstorage/?utm_source=devtools');
        const sessionStorageIcon = UI.Icon.Icon.create('mediumicon-table', 'resource-tree-item');
        this.sessionStorageListTreeElement.setLeadingIcons([sessionStorageIcon]);
        storageTreeElement.appendChild(this.sessionStorageListTreeElement);
        this.indexedDBListTreeElement = new IndexedDBTreeElement(panel);
        this.indexedDBListTreeElement.setLink('https://developer.chrome.com/docs/devtools/storage/indexeddb/?utm_source=devtools');
        storageTreeElement.appendChild(this.indexedDBListTreeElement);
        this.databasesListTreeElement =
            new ExpandableApplicationPanelTreeElement(panel, i18nString(UIStrings.webSql), 'Databases');
        this.databasesListTreeElement.setLink('https://developer.chrome.com/docs/devtools/storage/websql/?utm_source=devtools');
        const databaseIcon = UI.Icon.Icon.create('mediumicon-database', 'resource-tree-item');
        this.databasesListTreeElement.setLeadingIcons([databaseIcon]);
        storageTreeElement.appendChild(this.databasesListTreeElement);
        this.cookieListTreeElement =
            new ExpandableApplicationPanelTreeElement(panel, i18nString(UIStrings.cookies), 'Cookies');
        this.cookieListTreeElement.setLink('https://developer.chrome.com/docs/devtools/storage/cookies/?utm_source=devtools');
        const cookieIcon = UI.Icon.Icon.create('mediumicon-cookie', 'resource-tree-item');
        this.cookieListTreeElement.setLeadingIcons([cookieIcon]);
        storageTreeElement.appendChild(this.cookieListTreeElement);
        this.trustTokensTreeElement = new TrustTokensTreeElement(panel);
        storageTreeElement.appendChild(this.trustTokensTreeElement);
        this.interestGroupTreeElement = new InterestGroupTreeElement(panel);
        storageTreeElement.appendChild(this.interestGroupTreeElement);
        const cacheSectionTitle = i18nString(UIStrings.cache);
        const cacheTreeElement = this.addSidebarSection(cacheSectionTitle);
        this.cacheStorageListTreeElement = new ServiceWorkerCacheTreeElement(panel);
        cacheTreeElement.appendChild(this.cacheStorageListTreeElement);
        this.backForwardCacheListTreeElement = new BackForwardCacheTreeElement(panel);
        cacheTreeElement.appendChild(this.backForwardCacheListTreeElement);
        if (Root.Runtime.experiments.isEnabled('backgroundServices')) {
            const backgroundServiceSectionTitle = i18nString(UIStrings.backgroundServices);
            const backgroundServiceTreeElement = this.addSidebarSection(backgroundServiceSectionTitle);
            this.backgroundFetchTreeElement =
                new BackgroundServiceTreeElement(panel, "backgroundFetch" /* BackgroundFetch */);
            backgroundServiceTreeElement.appendChild(this.backgroundFetchTreeElement);
            this.backgroundSyncTreeElement =
                new BackgroundServiceTreeElement(panel, "backgroundSync" /* BackgroundSync */);
            backgroundServiceTreeElement.appendChild(this.backgroundSyncTreeElement);
            if (Root.Runtime.experiments.isEnabled('backgroundServicesNotifications')) {
                this.notificationsTreeElement =
                    new BackgroundServiceTreeElement(panel, "notifications" /* Notifications */);
                backgroundServiceTreeElement.appendChild(this.notificationsTreeElement);
            }
            if (Root.Runtime.experiments.isEnabled('backgroundServicesPaymentHandler')) {
                this.paymentHandlerTreeElement =
                    new BackgroundServiceTreeElement(panel, "paymentHandler" /* PaymentHandler */);
                backgroundServiceTreeElement.appendChild(this.paymentHandlerTreeElement);
            }
            this.periodicBackgroundSyncTreeElement =
                new BackgroundServiceTreeElement(panel, "periodicBackgroundSync" /* PeriodicBackgroundSync */);
            backgroundServiceTreeElement.appendChild(this.periodicBackgroundSyncTreeElement);
            if (Root.Runtime.experiments.isEnabled('backgroundServicesPushMessaging')) {
                this.pushMessagingTreeElement =
                    new BackgroundServiceTreeElement(panel, "pushMessaging" /* PushMessaging */);
                backgroundServiceTreeElement.appendChild(this.pushMessagingTreeElement);
            }
            if (Root.Runtime.experiments.isEnabled('reportingApiDebugging')) {
                this.reportingApiTreeElement = new ReportingApiTreeElement(panel);
                backgroundServiceTreeElement.appendChild(this.reportingApiTreeElement);
            }
        }
        const resourcesSectionTitle = i18nString(UIStrings.frames);
        const resourcesTreeElement = this.addSidebarSection(resourcesSectionTitle);
        this.resourcesSection = new ResourcesSection(panel, resourcesTreeElement);
        this.databaseTableViews = new Map();
        this.databaseQueryViews = new Map();
        this.databaseTreeElements = new Map();
        this.domStorageTreeElements = new Map();
        this.domains = {};
        this.sidebarTree.contentElement.addEventListener('mousemove', this.onmousemove.bind(this), false);
        this.sidebarTree.contentElement.addEventListener('mouseleave', this.onmouseleave.bind(this), false);
        SDK.TargetManager.TargetManager.instance().observeTargets(this);
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.ResourceTreeModel.ResourceTreeModel, SDK.ResourceTreeModel.Events.FrameNavigated, this.frameNavigated, this);
        const selection = this.panel.lastSelectedItemPath();
        if (!selection.length) {
            manifestTreeElement.select();
        }
        SDK.TargetManager.TargetManager.instance().observeModels(DOMStorageModel, {
            modelAdded: (model) => this.domStorageModelAdded(model),
            modelRemoved: (model) => this.domStorageModelRemoved(model),
        });
        SDK.TargetManager.TargetManager.instance().observeModels(IndexedDBModel, {
            modelAdded: (model) => model.enable(),
            modelRemoved: (model) => this.indexedDBListTreeElement.removeIndexedDBForModel(model),
        });
        SDK.TargetManager.TargetManager.instance().observeModels(InterestGroupStorageModel, {
            modelAdded: (model) => this.interestGroupModelAdded(model),
            modelRemoved: (model) => this.interestGroupModelRemoved(model),
        });
        // Work-around for crbug.com/1152713: Something is wrong with custom scrollbars and size containment.
        // @ts-ignore
        this.contentElement.style.contain = 'layout style';
    }
    addSidebarSection(title) {
        const treeElement = new UI.TreeOutline.TreeElement(title, true);
        treeElement.listItemElement.classList.add('storage-group-list-item');
        treeElement.setCollapsible(false);
        treeElement.selectable = false;
        this.sidebarTree.appendChild(treeElement);
        UI.ARIAUtils.setAccessibleName(treeElement.childrenListElement, title);
        return treeElement;
    }
    targetAdded(target) {
        if (this.target) {
            return;
        }
        this.target = target;
        this.databaseModel = target.model(DatabaseModel);
        if (this.databaseModel) {
            this.databaseModel.addEventListener(DatabaseModelEvents.DatabaseAdded, this.databaseAdded, this);
            this.databaseModel.addEventListener(DatabaseModelEvents.DatabasesRemoved, this.resetWebSQL, this);
        }
        const interestGroupModel = target.model(InterestGroupStorageModel);
        if (interestGroupModel) {
            interestGroupModel.addEventListener("InterestGroupAccess" /* InterestGroupAccess */, this.interestGroupAccess, this);
        }
        const resourceTreeModel = target.model(SDK.ResourceTreeModel.ResourceTreeModel);
        if (!resourceTreeModel) {
            return;
        }
        if (resourceTreeModel.cachedResourcesLoaded()) {
            this.initialize();
        }
        resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.CachedResourcesLoaded, this.initialize, this);
        resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.WillLoadCachedResources, this.resetWithFrames, this);
    }
    targetRemoved(target) {
        if (target !== this.target) {
            return;
        }
        delete this.target;
        const resourceTreeModel = target.model(SDK.ResourceTreeModel.ResourceTreeModel);
        if (resourceTreeModel) {
            resourceTreeModel.removeEventListener(SDK.ResourceTreeModel.Events.CachedResourcesLoaded, this.initialize, this);
            resourceTreeModel.removeEventListener(SDK.ResourceTreeModel.Events.WillLoadCachedResources, this.resetWithFrames, this);
        }
        if (this.databaseModel) {
            this.databaseModel.removeEventListener(DatabaseModelEvents.DatabaseAdded, this.databaseAdded, this);
            this.databaseModel.removeEventListener(DatabaseModelEvents.DatabasesRemoved, this.resetWebSQL, this);
            this.databaseModel = null;
        }
        const interestGroupModel = target.model(InterestGroupStorageModel);
        if (interestGroupModel) {
            interestGroupModel.removeEventListener("InterestGroupAccess" /* InterestGroupAccess */, this.interestGroupAccess, this);
        }
        this.resetWithFrames();
    }
    focus() {
        this.sidebarTree.focus();
    }
    initialize() {
        for (const frame of SDK.ResourceTreeModel.ResourceTreeModel.frames()) {
            this.addCookieDocument(frame);
        }
        if (this.databaseModel) {
            this.databaseModel.enable();
        }
        const interestGroupModel = this.target && this.target.model(InterestGroupStorageModel);
        if (interestGroupModel) {
            interestGroupModel.enable();
        }
        const cacheStorageModel = this.target && this.target.model(SDK.ServiceWorkerCacheModel.ServiceWorkerCacheModel);
        if (cacheStorageModel) {
            cacheStorageModel.enable();
        }
        const serviceWorkerCacheModel = this.target && this.target.model(SDK.ServiceWorkerCacheModel.ServiceWorkerCacheModel) || null;
        this.cacheStorageListTreeElement.initialize(serviceWorkerCacheModel);
        const backgroundServiceModel = this.target && this.target.model(BackgroundServiceModel) || null;
        if (Root.Runtime.experiments.isEnabled('backgroundServices')) {
            this.backgroundFetchTreeElement && this.backgroundFetchTreeElement.initialize(backgroundServiceModel);
            this.backgroundSyncTreeElement && this.backgroundSyncTreeElement.initialize(backgroundServiceModel);
            if (Root.Runtime.experiments.isEnabled('backgroundServicesNotifications') && this.notificationsTreeElement) {
                this.notificationsTreeElement.initialize(backgroundServiceModel);
            }
            if (Root.Runtime.experiments.isEnabled('backgroundServicesPaymentHandler') && this.paymentHandlerTreeElement) {
                this.paymentHandlerTreeElement.initialize(backgroundServiceModel);
            }
            this.periodicBackgroundSyncTreeElement &&
                this.periodicBackgroundSyncTreeElement.initialize(backgroundServiceModel);
            if (Root.Runtime.experiments.isEnabled('backgroundServicesPushMessaging') && this.pushMessagingTreeElement) {
                this.pushMessagingTreeElement.initialize(backgroundServiceModel);
            }
        }
    }
    domStorageModelAdded(model) {
        model.enable();
        model.storages().forEach(this.addDOMStorage.bind(this));
        model.addEventListener(DOMStorageModelEvents.DOMStorageAdded, this.domStorageAdded, this);
        model.addEventListener(DOMStorageModelEvents.DOMStorageRemoved, this.domStorageRemoved, this);
    }
    domStorageModelRemoved(model) {
        model.storages().forEach(this.removeDOMStorage.bind(this));
        model.removeEventListener(DOMStorageModelEvents.DOMStorageAdded, this.domStorageAdded, this);
        model.removeEventListener(DOMStorageModelEvents.DOMStorageRemoved, this.domStorageRemoved, this);
    }
    interestGroupModelAdded(model) {
        model.enable();
        model.addEventListener("InterestGroupAccess" /* InterestGroupAccess */, this.interestGroupAccess, this);
    }
    interestGroupModelRemoved(model) {
        model.disable();
        model.removeEventListener("InterestGroupAccess" /* InterestGroupAccess */, this.interestGroupAccess, this);
    }
    resetWithFrames() {
        this.resourcesSection.reset();
        this.reset();
    }
    resetWebSQL() {
        for (const queryView of this.databaseQueryViews.values()) {
            queryView.removeEventListener(DatabaseQueryViewEvents.SchemaUpdated, event => {
                void this.updateDatabaseTables(event);
            }, this);
        }
        this.databaseTableViews.clear();
        this.databaseQueryViews.clear();
        this.databaseTreeElements.clear();
        this.databasesListTreeElement.removeChildren();
        this.databasesListTreeElement.setExpandable(false);
    }
    treeElementAdded(event) {
        // On tree item selection its itemURL and those of its parents are persisted.
        // On reload/navigation we check for matches starting from the root on the
        // path to the current element. Matching nodes are expanded until we hit a
        // mismatch. This way we ensure that the longest matching path starting from
        // the root is expanded, even if we cannot match the whole path.
        const selection = this.panel.lastSelectedItemPath();
        if (!selection.length) {
            return;
        }
        const element = event.data;
        const elementPath = [element];
        for (let parent = element.parent; parent && 'itemURL' in parent && parent.itemURL; parent = parent.parent) {
            elementPath.push(parent);
        }
        let i = selection.length - 1;
        let j = elementPath.length - 1;
        while (i >= 0 && j >= 0 && selection[i] === elementPath[j].itemURL) {
            if (!elementPath[j].expanded) {
                if (i > 0) {
                    elementPath[j].expand();
                }
                if (!elementPath[j].selected) {
                    elementPath[j].select();
                }
            }
            i--;
            j--;
        }
    }
    reset() {
        this.domains = {};
        this.resetWebSQL();
        this.cookieListTreeElement.removeChildren();
        this.interestGroupTreeElement.clearEvents();
    }
    frameNavigated(event) {
        const frame = event.data;
        if (frame.isTopFrame()) {
            this.reset();
        }
        this.addCookieDocument(frame);
    }
    databaseAdded({ data: database }) {
        const databaseTreeElement = new DatabaseTreeElement(this, database);
        this.databaseTreeElements.set(database, databaseTreeElement);
        this.databasesListTreeElement.appendChild(databaseTreeElement);
    }
    interestGroupAccess(event) {
        this.interestGroupTreeElement.addEvent(event.data);
    }
    addCookieDocument(frame) {
        // In case the current frame was unreachable, show it's cookies
        // instead of the error interstitials because they might help to
        // debug why the frame was unreachable.
        const urlToParse = frame.unreachableUrl() || frame.url;
        const parsedURL = Common.ParsedURL.ParsedURL.fromString(urlToParse);
        if (!parsedURL || (parsedURL.scheme !== 'http' && parsedURL.scheme !== 'https' && parsedURL.scheme !== 'file')) {
            return;
        }
        const domain = parsedURL.securityOrigin();
        if (!this.domains[domain]) {
            this.domains[domain] = true;
            const cookieDomainTreeElement = new CookieTreeElement(this.panel, frame, domain);
            this.cookieListTreeElement.appendChild(cookieDomainTreeElement);
        }
    }
    domStorageAdded(event) {
        const domStorage = event.data;
        this.addDOMStorage(domStorage);
    }
    addDOMStorage(domStorage) {
        console.assert(!this.domStorageTreeElements.get(domStorage));
        console.assert(Boolean(domStorage.storageKey) || Boolean(domStorage.securityOrigin));
        const domStorageTreeElement = new DOMStorageTreeElement(this.panel, domStorage);
        this.domStorageTreeElements.set(domStorage, domStorageTreeElement);
        if (domStorage.isLocalStorage) {
            this.localStorageListTreeElement.appendChild(domStorageTreeElement);
        }
        else {
            this.sessionStorageListTreeElement.appendChild(domStorageTreeElement);
        }
    }
    domStorageRemoved(event) {
        const domStorage = event.data;
        this.removeDOMStorage(domStorage);
    }
    removeDOMStorage(domStorage) {
        const treeElement = this.domStorageTreeElements.get(domStorage);
        if (!treeElement) {
            return;
        }
        const wasSelected = treeElement.selected;
        const parentListTreeElement = treeElement.parent;
        if (parentListTreeElement) {
            parentListTreeElement.removeChild(treeElement);
            if (wasSelected) {
                parentListTreeElement.select();
            }
        }
        this.domStorageTreeElements.delete(domStorage);
    }
    selectDatabase(database) {
        if (database) {
            this.showDatabase(database);
            const treeElement = this.databaseTreeElements.get(database);
            treeElement && treeElement.select();
        }
    }
    async showResource(resource, line, column) {
        await this.resourcesSection.revealResource(resource, line, column);
    }
    showFrame(frame) {
        this.resourcesSection.revealAndSelectFrame(frame);
    }
    showDatabase(database, tableName) {
        if (!database) {
            return;
        }
        let view;
        if (tableName) {
            let tableViews = this.databaseTableViews.get(database);
            if (!tableViews) {
                tableViews = {};
                this.databaseTableViews.set(database, tableViews);
            }
            view = tableViews[tableName];
            if (!view) {
                view = new DatabaseTableView(database, tableName);
                tableViews[tableName] = view;
            }
        }
        else {
            view = this.databaseQueryViews.get(database);
            if (!view) {
                view = new DatabaseQueryView(database);
                this.databaseQueryViews.set(database, view);
                view.addEventListener(DatabaseQueryViewEvents.SchemaUpdated, event => {
                    void this.updateDatabaseTables(event);
                }, this);
            }
        }
        this.innerShowView(view);
    }
    showFileSystem(view) {
        this.innerShowView(view);
    }
    innerShowView(view) {
        this.panel.showView(view);
    }
    async updateDatabaseTables(event) {
        const database = event.data;
        if (!database) {
            return;
        }
        const databasesTreeElement = this.databaseTreeElements.get(database);
        if (!databasesTreeElement) {
            return;
        }
        databasesTreeElement.invalidateChildren();
        const tableViews = this.databaseTableViews.get(database);
        if (!tableViews) {
            return;
        }
        const tableNamesHash = new Set();
        const panel = this.panel;
        const tableNames = await database.tableNames();
        for (const tableName of tableNames) {
            tableNamesHash.add(tableName);
        }
        for (const tableName in tableViews) {
            if (!(tableNamesHash.has(tableName))) {
                if (panel.visibleView === tableViews[tableName]) {
                    panel.showView(null);
                }
                delete tableViews[tableName];
            }
        }
        await databasesTreeElement.updateChildren();
    }
    onmousemove(event) {
        const nodeUnderMouse = event.target;
        if (!nodeUnderMouse) {
            return;
        }
        const listNode = UI.UIUtils.enclosingNodeOrSelfWithNodeName(nodeUnderMouse, 'li');
        if (!listNode) {
            return;
        }
        const element = UI.TreeOutline.TreeElement.getTreeElementBylistItemNode(listNode);
        if (this.previousHoveredElement === element) {
            return;
        }
        if (this.previousHoveredElement) {
            this.previousHoveredElement.hovered = false;
            delete this.previousHoveredElement;
        }
        if (element instanceof FrameTreeElement) {
            this.previousHoveredElement = element;
            element.hovered = true;
        }
    }
    onmouseleave(_event) {
        if (this.previousHoveredElement) {
            this.previousHoveredElement.hovered = false;
            delete this.previousHoveredElement;
        }
    }
    wasShown() {
        super.wasShown();
        this.sidebarTree.registerCSSFiles([resourcesSidebarStyles]);
    }
}
export class BackgroundServiceTreeElement extends ApplicationPanelTreeElement {
    serviceName;
    view;
    model;
    selectedInternal;
    constructor(storagePanel, serviceName) {
        super(storagePanel, BackgroundServiceView.getUIString(serviceName), false);
        this.serviceName = serviceName;
        /* Whether the element has been selected. */
        this.selectedInternal = false;
        this.view = null;
        this.model = null;
        const backgroundServiceIcon = UI.Icon.Icon.create(this.getIconType(), 'resource-tree-item');
        this.setLeadingIcons([backgroundServiceIcon]);
    }
    getIconType() {
        switch (this.serviceName) {
            case "backgroundFetch" /* BackgroundFetch */:
                return 'mediumicon-fetch';
            case "backgroundSync" /* BackgroundSync */:
                return 'mediumicon-sync';
            case "pushMessaging" /* PushMessaging */:
                return 'mediumicon-cloud';
            case "notifications" /* Notifications */:
                return 'mediumicon-bell';
            case "paymentHandler" /* PaymentHandler */:
                return 'mediumicon-payment';
            case "periodicBackgroundSync" /* PeriodicBackgroundSync */:
                return 'mediumicon-schedule';
            default:
                console.error(`Service ${this.serviceName} does not have a dedicated icon`);
                return 'mediumicon-table';
        }
    }
    initialize(model) {
        this.model = model;
        // Show the view if the model was initialized after selection.
        if (this.selectedInternal && !this.view) {
            this.onselect(false);
        }
    }
    get itemURL() {
        return `background-service://${this.serviceName}`;
    }
    onselect(selectedByUser) {
        super.onselect(selectedByUser);
        this.selectedInternal = true;
        if (!this.model) {
            return false;
        }
        if (!this.view) {
            this.view = new BackgroundServiceView(this.serviceName, this.model);
        }
        this.showView(this.view);
        UI.Context.Context.instance().setFlavor(BackgroundServiceView, this.view);
        Host.userMetrics.panelShown('background_service_' + this.serviceName);
        return false;
    }
}
export class DatabaseTreeElement extends ApplicationPanelTreeElement {
    sidebar;
    database;
    constructor(sidebar, database) {
        super(sidebar.panel, database.name, true);
        this.sidebar = sidebar;
        this.database = database;
        const icon = UI.Icon.Icon.create('mediumicon-database', 'resource-tree-item');
        this.setLeadingIcons([icon]);
    }
    get itemURL() {
        return 'database://' + encodeURI(this.database.name);
    }
    onselect(selectedByUser) {
        super.onselect(selectedByUser);
        this.sidebar.showDatabase(this.database);
        Host.userMetrics.panelShown(Host.UserMetrics.PanelCodes[Host.UserMetrics.PanelCodes.web_sql]);
        return false;
    }
    onexpand() {
        void this.updateChildren();
    }
    async updateChildren() {
        this.removeChildren();
        const tableNames = await this.database.tableNames();
        for (const tableName of tableNames) {
            this.appendChild(new DatabaseTableTreeElement(this.sidebar, this.database, tableName));
        }
    }
}
export class DatabaseTableTreeElement extends ApplicationPanelTreeElement {
    sidebar;
    database;
    tableName;
    constructor(sidebar, database, tableName) {
        super(sidebar.panel, tableName, false);
        this.sidebar = sidebar;
        this.database = database;
        this.tableName = tableName;
        const icon = UI.Icon.Icon.create('mediumicon-table', 'resource-tree-item');
        this.setLeadingIcons([icon]);
    }
    get itemURL() {
        return 'database://' + encodeURI(this.database.name) + '/' + encodeURI(this.tableName);
    }
    onselect(selectedByUser) {
        super.onselect(selectedByUser);
        this.sidebar.showDatabase(this.database, this.tableName);
        Host.userMetrics.panelShown(Host.UserMetrics.PanelCodes[Host.UserMetrics.PanelCodes.web_sql]);
        return false;
    }
}
export class ServiceWorkersTreeElement extends ApplicationPanelTreeElement {
    view;
    constructor(storagePanel) {
        super(storagePanel, i18n.i18n.lockedString('Service Workers'), false);
        const icon = UI.Icon.Icon.create('mediumicon-service-worker', 'resource-tree-item');
        this.setLeadingIcons([icon]);
    }
    get itemURL() {
        return 'service-workers://';
    }
    onselect(selectedByUser) {
        super.onselect(selectedByUser);
        if (!this.view) {
            this.view = new ServiceWorkersView();
        }
        this.showView(this.view);
        Host.userMetrics.panelShown(Host.UserMetrics.PanelCodes[Host.UserMetrics.PanelCodes.service_workers]);
        return false;
    }
}
export class AppManifestTreeElement extends ApplicationPanelTreeElement {
    view;
    constructor(storagePanel) {
        super(storagePanel, i18nString(UIStrings.manifest), false);
        const icon = UI.Icon.Icon.create('mediumicon-manifest', 'resource-tree-item');
        this.setLeadingIcons([icon]);
    }
    get itemURL() {
        return 'manifest://';
    }
    onselect(selectedByUser) {
        super.onselect(selectedByUser);
        if (!this.view) {
            this.view = new AppManifestView();
        }
        this.showView(this.view);
        Host.userMetrics.panelShown(Host.UserMetrics.PanelCodes[Host.UserMetrics.PanelCodes.app_manifest]);
        return false;
    }
}
export class ClearStorageTreeElement extends ApplicationPanelTreeElement {
    view;
    constructor(storagePanel) {
        super(storagePanel, i18nString(UIStrings.storage), false);
        const icon = UI.Icon.Icon.create('mediumicon-database', 'resource-tree-item');
        this.setLeadingIcons([icon]);
    }
    get itemURL() {
        return 'clear-storage://';
    }
    onselect(selectedByUser) {
        super.onselect(selectedByUser);
        if (!this.view) {
            this.view = new StorageView();
        }
        this.showView(this.view);
        Host.userMetrics.panelShown(Host.UserMetrics.PanelCodes[Host.UserMetrics.PanelCodes.storage]);
        return false;
    }
}
export class IndexedDBTreeElement extends ExpandableApplicationPanelTreeElement {
    idbDatabaseTreeElements;
    constructor(storagePanel) {
        super(storagePanel, i18nString(UIStrings.indexeddb), 'IndexedDB');
        const icon = UI.Icon.Icon.create('mediumicon-database', 'resource-tree-item');
        this.setLeadingIcons([icon]);
        this.idbDatabaseTreeElements = [];
        this.initialize();
    }
    initialize() {
        SDK.TargetManager.TargetManager.instance().addModelListener(IndexedDBModel, IndexedDBModelEvents.DatabaseAdded, this.indexedDBAdded, this);
        SDK.TargetManager.TargetManager.instance().addModelListener(IndexedDBModel, IndexedDBModelEvents.DatabaseRemoved, this.indexedDBRemoved, this);
        SDK.TargetManager.TargetManager.instance().addModelListener(IndexedDBModel, IndexedDBModelEvents.DatabaseLoaded, this.indexedDBLoaded, this);
        SDK.TargetManager.TargetManager.instance().addModelListener(IndexedDBModel, IndexedDBModelEvents.IndexedDBContentUpdated, this.indexedDBContentUpdated, this);
        // TODO(szuend): Replace with a Set once two web tests no longer directly access this private
        //               variable (indexeddb/live-update-indexeddb-content.js, indexeddb/delete-entry.js).
        this.idbDatabaseTreeElements = [];
        for (const indexedDBModel of SDK.TargetManager.TargetManager.instance().models(IndexedDBModel)) {
            const databases = indexedDBModel.databases();
            for (let j = 0; j < databases.length; ++j) {
                this.addIndexedDB(indexedDBModel, databases[j]);
            }
        }
    }
    removeIndexedDBForModel(model) {
        const idbDatabaseTreeElements = this.idbDatabaseTreeElements.filter(element => element.model === model);
        for (const idbDatabaseTreeElement of idbDatabaseTreeElements) {
            this.removeIDBDatabaseTreeElement(idbDatabaseTreeElement);
        }
    }
    onattach() {
        super.onattach();
        this.listItemElement.addEventListener('contextmenu', this.handleContextMenuEvent.bind(this), true);
    }
    handleContextMenuEvent(event) {
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        contextMenu.defaultSection().appendItem(i18nString(UIStrings.refreshIndexeddb), this.refreshIndexedDB.bind(this));
        void contextMenu.show();
    }
    refreshIndexedDB() {
        for (const indexedDBModel of SDK.TargetManager.TargetManager.instance().models(IndexedDBModel)) {
            void indexedDBModel.refreshDatabaseNames();
        }
    }
    indexedDBAdded({ data: { databaseId, model }, }) {
        this.addIndexedDB(model, databaseId);
    }
    addIndexedDB(model, databaseId) {
        const idbDatabaseTreeElement = new IDBDatabaseTreeElement(this.resourcesPanel, model, databaseId);
        this.idbDatabaseTreeElements.push(idbDatabaseTreeElement);
        this.appendChild(idbDatabaseTreeElement);
        model.refreshDatabase(databaseId);
    }
    indexedDBRemoved({ data: { databaseId, model }, }) {
        const idbDatabaseTreeElement = this.idbDatabaseTreeElement(model, databaseId);
        if (!idbDatabaseTreeElement) {
            return;
        }
        this.removeIDBDatabaseTreeElement(idbDatabaseTreeElement);
    }
    removeIDBDatabaseTreeElement(idbDatabaseTreeElement) {
        idbDatabaseTreeElement.clear();
        this.removeChild(idbDatabaseTreeElement);
        Platform.ArrayUtilities.removeElement(this.idbDatabaseTreeElements, idbDatabaseTreeElement);
        this.setExpandable(this.childCount() > 0);
    }
    indexedDBLoaded({ data: { database, model, entriesUpdated } }) {
        const idbDatabaseTreeElement = this.idbDatabaseTreeElement(model, database.databaseId);
        if (!idbDatabaseTreeElement) {
            return;
        }
        idbDatabaseTreeElement.update(database, entriesUpdated);
        this.indexedDBLoadedForTest();
    }
    indexedDBLoadedForTest() {
        // For sniffing in tests.
    }
    indexedDBContentUpdated({ data: { databaseId, objectStoreName, model }, }) {
        const idbDatabaseTreeElement = this.idbDatabaseTreeElement(model, databaseId);
        if (!idbDatabaseTreeElement) {
            return;
        }
        idbDatabaseTreeElement.indexedDBContentUpdated(objectStoreName);
    }
    idbDatabaseTreeElement(model, databaseId) {
        return this.idbDatabaseTreeElements.find(x => x.databaseId.equals(databaseId) && x.model === model) || null;
    }
}
export class IDBDatabaseTreeElement extends ApplicationPanelTreeElement {
    model;
    databaseId;
    idbObjectStoreTreeElements;
    database;
    view;
    constructor(storagePanel, model, databaseId) {
        super(storagePanel, databaseId.name + ' - ' + databaseId.securityOrigin, false);
        this.model = model;
        this.databaseId = databaseId;
        this.idbObjectStoreTreeElements = new Map();
        const icon = UI.Icon.Icon.create('mediumicon-database', 'resource-tree-item');
        this.setLeadingIcons([icon]);
        this.model.addEventListener(IndexedDBModelEvents.DatabaseNamesRefreshed, this.refreshIndexedDB, this);
    }
    get itemURL() {
        return 'indexedDB://' + this.databaseId.securityOrigin + '/' + this.databaseId.name;
    }
    onattach() {
        super.onattach();
        this.listItemElement.addEventListener('contextmenu', this.handleContextMenuEvent.bind(this), true);
    }
    handleContextMenuEvent(event) {
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        contextMenu.defaultSection().appendItem(i18nString(UIStrings.refreshIndexeddb), this.refreshIndexedDB.bind(this));
        void contextMenu.show();
    }
    refreshIndexedDB() {
        this.model.refreshDatabase(this.databaseId);
    }
    indexedDBContentUpdated(objectStoreName) {
        const treeElement = this.idbObjectStoreTreeElements.get(objectStoreName);
        if (treeElement) {
            treeElement.markNeedsRefresh();
        }
    }
    update(database, entriesUpdated) {
        this.database = database;
        const objectStoreNames = new Set();
        for (const objectStoreName of [...this.database.objectStores.keys()].sort()) {
            const objectStore = this.database.objectStores.get(objectStoreName);
            if (!objectStore) {
                continue;
            }
            objectStoreNames.add(objectStore.name);
            let treeElement = this.idbObjectStoreTreeElements.get(objectStore.name);
            if (!treeElement) {
                treeElement = new IDBObjectStoreTreeElement(this.resourcesPanel, this.model, this.databaseId, objectStore);
                this.idbObjectStoreTreeElements.set(objectStore.name, treeElement);
                this.appendChild(treeElement);
            }
            treeElement.update(objectStore, entriesUpdated);
        }
        for (const objectStoreName of this.idbObjectStoreTreeElements.keys()) {
            if (!objectStoreNames.has(objectStoreName)) {
                this.objectStoreRemoved(objectStoreName);
            }
        }
        if (this.view) {
            this.view.update(database);
        }
        this.updateTooltip();
    }
    updateTooltip() {
        const version = this.database ? this.database.version : '-';
        if (Object.keys(this.idbObjectStoreTreeElements).length === 0) {
            this.tooltip = i18nString(UIStrings.versionSEmpty, { PH1: version });
        }
        else {
            this.tooltip = i18nString(UIStrings.versionS, { PH1: version });
        }
    }
    onselect(selectedByUser) {
        super.onselect(selectedByUser);
        if (!this.database) {
            return false;
        }
        if (!this.view) {
            this.view = new IDBDatabaseView(this.model, this.database);
        }
        this.showView(this.view);
        Host.userMetrics.panelShown(Host.UserMetrics.PanelCodes[Host.UserMetrics.PanelCodes.indexed_db]);
        return false;
    }
    objectStoreRemoved(objectStoreName) {
        const objectStoreTreeElement = this.idbObjectStoreTreeElements.get(objectStoreName);
        if (objectStoreTreeElement) {
            objectStoreTreeElement.clear();
            this.removeChild(objectStoreTreeElement);
        }
        this.idbObjectStoreTreeElements.delete(objectStoreName);
        this.updateTooltip();
    }
    clear() {
        for (const objectStoreName of this.idbObjectStoreTreeElements.keys()) {
            this.objectStoreRemoved(objectStoreName);
        }
    }
}
export class IDBObjectStoreTreeElement extends ApplicationPanelTreeElement {
    model;
    databaseId;
    idbIndexTreeElements;
    objectStore;
    view;
    constructor(storagePanel, model, databaseId, objectStore) {
        super(storagePanel, objectStore.name, false);
        this.model = model;
        this.databaseId = databaseId;
        this.idbIndexTreeElements = new Map();
        this.objectStore = objectStore;
        this.view = null;
        const icon = UI.Icon.Icon.create('mediumicon-table', 'resource-tree-item');
        this.setLeadingIcons([icon]);
    }
    get itemURL() {
        return 'indexedDB://' + this.databaseId.securityOrigin + '/' + this.databaseId.name + '/' + this.objectStore.name;
    }
    onattach() {
        super.onattach();
        this.listItemElement.addEventListener('contextmenu', this.handleContextMenuEvent.bind(this), true);
    }
    markNeedsRefresh() {
        if (this.view) {
            this.view.markNeedsRefresh();
        }
        for (const treeElement of this.idbIndexTreeElements.values()) {
            treeElement.markNeedsRefresh();
        }
    }
    handleContextMenuEvent(event) {
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        contextMenu.defaultSection().appendItem(i18nString(UIStrings.clear), this.clearObjectStore.bind(this));
        void contextMenu.show();
    }
    refreshObjectStore() {
        if (this.view) {
            this.view.refreshData();
        }
        for (const treeElement of this.idbIndexTreeElements.values()) {
            treeElement.refreshIndex();
        }
    }
    async clearObjectStore() {
        await this.model.clearObjectStore(this.databaseId, this.objectStore.name);
        this.update(this.objectStore, true);
    }
    update(objectStore, entriesUpdated) {
        this.objectStore = objectStore;
        const indexNames = new Set();
        for (const index of this.objectStore.indexes.values()) {
            indexNames.add(index.name);
            let treeElement = this.idbIndexTreeElements.get(index.name);
            if (!treeElement) {
                treeElement = new IDBIndexTreeElement(this.resourcesPanel, this.model, this.databaseId, this.objectStore, index, this.refreshObjectStore.bind(this));
                this.idbIndexTreeElements.set(index.name, treeElement);
                this.appendChild(treeElement);
            }
            treeElement.update(this.objectStore, index, entriesUpdated);
        }
        for (const indexName of this.idbIndexTreeElements.keys()) {
            if (!indexNames.has(indexName)) {
                this.indexRemoved(indexName);
            }
        }
        for (const [indexName, treeElement] of this.idbIndexTreeElements.entries()) {
            if (!indexNames.has(indexName)) {
                this.removeChild(treeElement);
                this.idbIndexTreeElements.delete(indexName);
            }
        }
        if (this.childCount()) {
            this.expand();
        }
        if (this.view && entriesUpdated) {
            this.view.update(this.objectStore, null);
        }
        this.updateTooltip();
    }
    updateTooltip() {
        const keyPathString = this.objectStore.keyPathString;
        let tooltipString = keyPathString !== null ? i18nString(UIStrings.keyPathS, { PH1: keyPathString }) : '';
        if (this.objectStore.autoIncrement) {
            tooltipString += '\n' + i18n.i18n.lockedString('autoIncrement');
        }
        this.tooltip = tooltipString;
    }
    onselect(selectedByUser) {
        super.onselect(selectedByUser);
        if (!this.view) {
            this.view =
                new IDBDataView(this.model, this.databaseId, this.objectStore, null, this.refreshObjectStore.bind(this));
        }
        this.showView(this.view);
        Host.userMetrics.panelShown(Host.UserMetrics.PanelCodes[Host.UserMetrics.PanelCodes.indexed_db]);
        return false;
    }
    indexRemoved(indexName) {
        const indexTreeElement = this.idbIndexTreeElements.get(indexName);
        if (indexTreeElement) {
            indexTreeElement.clear();
            this.removeChild(indexTreeElement);
        }
        this.idbIndexTreeElements.delete(indexName);
    }
    clear() {
        for (const indexName of this.idbIndexTreeElements.keys()) {
            this.indexRemoved(indexName);
        }
        if (this.view) {
            this.view.clear();
        }
    }
}
export class IDBIndexTreeElement extends ApplicationPanelTreeElement {
    model;
    databaseId;
    objectStore;
    index;
    refreshObjectStore;
    view;
    constructor(storagePanel, model, databaseId, objectStore, index, refreshObjectStore) {
        super(storagePanel, index.name, false);
        this.model = model;
        this.databaseId = databaseId;
        this.objectStore = objectStore;
        this.index = index;
        this.refreshObjectStore = refreshObjectStore;
    }
    get itemURL() {
        return 'indexedDB://' + this.databaseId.securityOrigin + '/' + this.databaseId.name + '/' + this.objectStore.name +
            '/' + this.index.name;
    }
    markNeedsRefresh() {
        if (this.view) {
            this.view.markNeedsRefresh();
        }
    }
    refreshIndex() {
        if (this.view) {
            this.view.refreshData();
        }
    }
    update(objectStore, index, entriesUpdated) {
        this.objectStore = objectStore;
        this.index = index;
        if (this.view && entriesUpdated) {
            this.view.update(this.objectStore, this.index);
        }
        this.updateTooltip();
    }
    updateTooltip() {
        const tooltipLines = [];
        const keyPathString = this.index.keyPathString;
        tooltipLines.push(i18nString(UIStrings.keyPathS, { PH1: keyPathString }));
        if (this.index.unique) {
            tooltipLines.push(i18n.i18n.lockedString('unique'));
        }
        if (this.index.multiEntry) {
            tooltipLines.push(i18n.i18n.lockedString('multiEntry'));
        }
        this.tooltip = tooltipLines.join('\n');
    }
    onselect(selectedByUser) {
        super.onselect(selectedByUser);
        if (!this.view) {
            this.view = new IDBDataView(this.model, this.databaseId, this.objectStore, this.index, this.refreshObjectStore);
        }
        this.showView(this.view);
        Host.userMetrics.panelShown(Host.UserMetrics.PanelCodes[Host.UserMetrics.PanelCodes.indexed_db]);
        return false;
    }
    clear() {
        if (this.view) {
            this.view.clear();
        }
    }
}
export class DOMStorageTreeElement extends ApplicationPanelTreeElement {
    domStorage;
    constructor(storagePanel, domStorage) {
        super(storagePanel, domStorage.securityOrigin ? domStorage.securityOrigin :
            (domStorage.storageKey ? domStorage.storageKey : i18nString(UIStrings.localFiles)), false);
        this.domStorage = domStorage;
        const icon = UI.Icon.Icon.create('mediumicon-table', 'resource-tree-item');
        this.setLeadingIcons([icon]);
    }
    get itemURL() {
        return 'storage://' + this.domStorage.securityOrigin + '/' +
            (this.domStorage.isLocalStorage ? 'local' : 'session');
    }
    onselect(selectedByUser) {
        super.onselect(selectedByUser);
        Host.userMetrics.panelShown(Host.UserMetrics.PanelCodes[Host.UserMetrics.PanelCodes.dom_storage]);
        this.resourcesPanel.showDOMStorage(this.domStorage);
        return false;
    }
    onattach() {
        super.onattach();
        this.listItemElement.addEventListener('contextmenu', this.handleContextMenuEvent.bind(this), true);
    }
    handleContextMenuEvent(event) {
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        contextMenu.defaultSection().appendItem(i18nString(UIStrings.clear), () => this.domStorage.clear());
        void contextMenu.show();
    }
}
export class CookieTreeElement extends ApplicationPanelTreeElement {
    target;
    cookieDomainInternal;
    constructor(storagePanel, frame, cookieDomain) {
        super(storagePanel, cookieDomain ? cookieDomain : i18nString(UIStrings.localFiles), false);
        this.target = frame.resourceTreeModel().target();
        this.cookieDomainInternal = cookieDomain;
        this.tooltip = i18nString(UIStrings.cookiesUsedByFramesFromS, { PH1: cookieDomain });
        const icon = UI.Icon.Icon.create('mediumicon-cookie', 'resource-tree-item');
        this.setLeadingIcons([icon]);
    }
    get itemURL() {
        return 'cookies://' + this.cookieDomainInternal;
    }
    cookieDomain() {
        return this.cookieDomainInternal;
    }
    onattach() {
        super.onattach();
        this.listItemElement.addEventListener('contextmenu', this.handleContextMenuEvent.bind(this), true);
    }
    handleContextMenuEvent(event) {
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        contextMenu.defaultSection().appendItem(i18nString(UIStrings.clear), () => this.resourcesPanel.clearCookies(this.target, this.cookieDomainInternal));
        void contextMenu.show();
    }
    onselect(selectedByUser) {
        super.onselect(selectedByUser);
        this.resourcesPanel.showCookies(this.target, this.cookieDomainInternal);
        Host.userMetrics.panelShown(Host.UserMetrics.PanelCodes[Host.UserMetrics.PanelCodes.cookies]);
        return false;
    }
}
export class StorageCategoryView extends UI.Widget.VBox {
    emptyWidget;
    linkElement;
    constructor() {
        super();
        this.element.classList.add('storage-view');
        this.emptyWidget = new UI.EmptyWidget.EmptyWidget('');
        this.linkElement = null;
        this.emptyWidget.show(this.element);
    }
    setText(text) {
        this.emptyWidget.text = text;
    }
    setLink(link) {
        if (link && !this.linkElement) {
            this.linkElement = this.emptyWidget.appendLink(link);
        }
        if (!link && this.linkElement) {
            this.linkElement.classList.add('hidden');
        }
        if (link && this.linkElement) {
            this.linkElement.setAttribute('href', link);
            this.linkElement.classList.remove('hidden');
        }
    }
}
export class ResourcesSection {
    panel;
    treeElement;
    treeElementForFrameId;
    treeElementForTargetId;
    constructor(storagePanel, treeElement) {
        this.panel = storagePanel;
        this.treeElement = treeElement;
        UI.ARIAUtils.setAccessibleName(this.treeElement.listItemNode, 'Resources Section');
        this.treeElementForFrameId = new Map();
        this.treeElementForTargetId = new Map();
        const frameManager = SDK.FrameManager.FrameManager.instance();
        frameManager.addEventListener(SDK.FrameManager.Events.FrameAddedToTarget, event => this.frameAdded(event.data.frame), this);
        frameManager.addEventListener(SDK.FrameManager.Events.FrameRemoved, event => this.frameDetached(event.data.frameId), this);
        frameManager.addEventListener(SDK.FrameManager.Events.FrameNavigated, event => this.frameNavigated(event.data.frame), this);
        frameManager.addEventListener(SDK.FrameManager.Events.ResourceAdded, event => this.resourceAdded(event.data.resource), this);
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.ChildTargetManager.ChildTargetManager, SDK.ChildTargetManager.Events.TargetCreated, this.windowOpened, this);
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.ChildTargetManager.ChildTargetManager, SDK.ChildTargetManager.Events.TargetInfoChanged, this.windowChanged, this);
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.ChildTargetManager.ChildTargetManager, SDK.ChildTargetManager.Events.TargetDestroyed, this.windowDestroyed, this);
        SDK.TargetManager.TargetManager.instance().observeTargets(this);
        for (const frame of frameManager.getAllFrames()) {
            if (!this.treeElementForFrameId.get(frame.id)) {
                this.addFrameAndParents(frame);
            }
            const childTargetManager = frame.resourceTreeModel().target().model(SDK.ChildTargetManager.ChildTargetManager);
            if (childTargetManager) {
                for (const targetInfo of childTargetManager.targetInfos()) {
                    this.windowOpened({ data: targetInfo });
                }
            }
        }
    }
    targetAdded(target) {
        if (target.type() === SDK.Target.Type.Worker || target.type() === SDK.Target.Type.ServiceWorker) {
            void this.workerAdded(target);
        }
    }
    async workerAdded(target) {
        const parentTarget = target.parentTarget();
        if (!parentTarget) {
            return;
        }
        const parentTargetId = parentTarget.id();
        const frameTreeElement = this.treeElementForTargetId.get(parentTargetId);
        const targetId = target.id();
        assertNotMainTarget(targetId);
        const { targetInfo } = await parentTarget.targetAgent().invoke_getTargetInfo({ targetId });
        if (frameTreeElement && targetInfo) {
            frameTreeElement.workerCreated(targetInfo);
        }
    }
    targetRemoved(_target) {
    }
    addFrameAndParents(frame) {
        const parentFrame = frame.parentFrame();
        if (parentFrame && !this.treeElementForFrameId.get(parentFrame.id)) {
            this.addFrameAndParents(parentFrame);
        }
        this.frameAdded(frame);
    }
    expandFrame(frame) {
        if (!frame) {
            return false;
        }
        let treeElement = this.treeElementForFrameId.get(frame.id);
        if (!treeElement && !this.expandFrame(frame.parentFrame())) {
            return false;
        }
        treeElement = this.treeElementForFrameId.get(frame.id);
        if (!treeElement) {
            return false;
        }
        treeElement.expand();
        return true;
    }
    async revealResource(resource, line, column) {
        if (!this.expandFrame(resource.frame())) {
            return;
        }
        const resourceTreeElement = FrameResourceTreeElement.forResource(resource);
        if (resourceTreeElement) {
            await resourceTreeElement.revealResource(line, column);
        }
    }
    revealAndSelectFrame(frame) {
        const frameTreeElement = this.treeElementForFrameId.get(frame.id);
        frameTreeElement?.reveal();
        frameTreeElement?.select();
    }
    frameAdded(frame) {
        const parentFrame = frame.parentFrame();
        const parentTreeElement = parentFrame ? this.treeElementForFrameId.get(parentFrame.id) : this.treeElement;
        if (!parentTreeElement) {
            return;
        }
        const existingElement = this.treeElementForFrameId.get(frame.id);
        if (existingElement) {
            this.treeElementForFrameId.delete(frame.id);
            if (existingElement.parent) {
                existingElement.parent.removeChild(existingElement);
            }
        }
        const frameTreeElement = new FrameTreeElement(this, frame);
        this.treeElementForFrameId.set(frame.id, frameTreeElement);
        const targetId = frame.resourceTreeModel().target().id();
        if (!this.treeElementForTargetId.get(targetId)) {
            this.treeElementForTargetId.set(targetId, frameTreeElement);
        }
        parentTreeElement.appendChild(frameTreeElement);
        for (const resource of frame.resources()) {
            this.resourceAdded(resource);
        }
    }
    frameDetached(frameId) {
        const frameTreeElement = this.treeElementForFrameId.get(frameId);
        if (!frameTreeElement) {
            return;
        }
        this.treeElementForFrameId.delete(frameId);
        if (frameTreeElement.parent) {
            frameTreeElement.parent.removeChild(frameTreeElement);
        }
    }
    frameNavigated(frame) {
        const frameTreeElement = this.treeElementForFrameId.get(frame.id);
        if (frameTreeElement) {
            void frameTreeElement.frameNavigated(frame);
        }
    }
    resourceAdded(resource) {
        if (!resource.frameId) {
            return;
        }
        const frameTreeElement = this.treeElementForFrameId.get(resource.frameId);
        if (!frameTreeElement) {
            // This is a frame's main resource, it will be retained
            // and re-added by the resource manager;
            return;
        }
        frameTreeElement.appendResource(resource);
    }
    windowOpened(event) {
        const targetInfo = event.data;
        // Events for DevTools windows are ignored because they do not have an openerId
        if (targetInfo.openerId && targetInfo.type === 'page') {
            const frameTreeElement = this.treeElementForFrameId.get(targetInfo.openerId);
            if (frameTreeElement) {
                this.treeElementForTargetId.set(targetInfo.targetId, frameTreeElement);
                frameTreeElement.windowOpened(targetInfo);
            }
        }
    }
    windowDestroyed(event) {
        const targetId = event.data;
        const frameTreeElement = this.treeElementForTargetId.get(targetId);
        if (frameTreeElement) {
            frameTreeElement.windowDestroyed(targetId);
            this.treeElementForTargetId.delete(targetId);
        }
    }
    windowChanged(event) {
        const targetInfo = event.data;
        // Events for DevTools windows are ignored because they do not have an openerId
        if (targetInfo.openerId && targetInfo.type === 'page') {
            const frameTreeElement = this.treeElementForFrameId.get(targetInfo.openerId);
            if (frameTreeElement) {
                frameTreeElement.windowChanged(targetInfo);
            }
        }
    }
    reset() {
        this.treeElement.removeChildren();
        this.treeElementForFrameId.clear();
        this.treeElementForTargetId.clear();
    }
}
export class FrameTreeElement extends ApplicationPanelTreeElement {
    section;
    frame;
    frameId;
    categoryElements;
    treeElementForResource;
    treeElementForWindow;
    treeElementForWorker;
    view;
    constructor(section, frame) {
        super(section.panel, '', false);
        this.section = section;
        this.frame = frame;
        this.frameId = frame.id;
        this.categoryElements = new Map();
        this.treeElementForResource = new Map();
        this.treeElementForWindow = new Map();
        this.treeElementForWorker = new Map();
        void this.frameNavigated(frame);
        this.view = null;
    }
    getIconTypeForFrame(frame) {
        if (frame.isTopFrame()) {
            return frame.unreachableUrl() ? 'mediumicon-frame-blocked' : 'mediumicon-frame';
        }
        return frame.unreachableUrl() ? 'mediumicon-frame-embedded-blocked' : 'mediumicon-frame-embedded';
    }
    async frameNavigated(frame) {
        const icon = UI.Icon.Icon.create(this.getIconTypeForFrame(frame));
        if (frame.unreachableUrl()) {
            icon.classList.add('red-icon');
        }
        this.setLeadingIcons([icon]);
        this.invalidateChildren();
        this.frameId = frame.id;
        if (this.title !== frame.displayName()) {
            this.title = frame.displayName();
            UI.ARIAUtils.setAccessibleName(this.listItemElement, this.title);
            if (this.parent) {
                const parent = this.parent;
                // Insert frame at new position to preserve correct alphabetical order
                parent.removeChild(this);
                parent.appendChild(this);
            }
        }
        this.categoryElements.clear();
        this.treeElementForResource.clear();
        this.treeElementForWorker.clear();
        if (this.selected) {
            this.view = new ApplicationComponents.FrameDetailsView.FrameDetailsView(this.frame);
            this.showView(this.view);
        }
        else {
            this.view = null;
        }
        // Service Workers' parent is always the top frame. We need to reconstruct
        // the service worker tree elements after those navigations which allow
        // the service workers to stay alive.
        if (frame.isTopFrame()) {
            const targets = SDK.TargetManager.TargetManager.instance().targets();
            for (const target of targets) {
                if (target.type() === SDK.Target.Type.ServiceWorker) {
                    const targetId = target.id();
                    assertNotMainTarget(targetId);
                    const agent = frame.resourceTreeModel().target().targetAgent();
                    const targetInfo = (await agent.invoke_getTargetInfo({ targetId })).targetInfo;
                    this.workerCreated(targetInfo);
                }
            }
        }
    }
    get itemURL() {
        // This is used to persist over reloads/navigation which frame was selected.
        // A frame's title can change on DevTools refresh, so we resort to using
        // the URL instead (even though it is not guaranteed to be unique).
        if (this.frame.isTopFrame()) {
            return 'frame://';
        }
        return 'frame://' + encodeURI(this.frame.url);
    }
    onselect(selectedByUser) {
        super.onselect(selectedByUser);
        if (!this.view) {
            this.view = new ApplicationComponents.FrameDetailsView.FrameDetailsView(this.frame);
        }
        else {
            this.view.update();
        }
        Host.userMetrics.panelShown(Host.UserMetrics.PanelCodes[Host.UserMetrics.PanelCodes.frame_details]);
        this.showView(this.view);
        this.listItemElement.classList.remove('hovered');
        SDK.OverlayModel.OverlayModel.hideDOMNodeHighlight();
        return false;
    }
    set hovered(hovered) {
        if (hovered) {
            this.listItemElement.classList.add('hovered');
            void this.frame.highlight();
        }
        else {
            this.listItemElement.classList.remove('hovered');
            SDK.OverlayModel.OverlayModel.hideDOMNodeHighlight();
        }
    }
    appendResource(resource) {
        const statusCode = resource.statusCode();
        if (statusCode >= 301 && statusCode <= 303) {
            return;
        }
        const resourceType = resource.resourceType();
        const categoryName = resourceType.name();
        let categoryElement = resourceType === Common.ResourceType.resourceTypes.Document ? this : this.categoryElements.get(categoryName);
        if (!categoryElement) {
            categoryElement = new ExpandableApplicationPanelTreeElement(this.section.panel, resource.resourceType().category().title(), categoryName, categoryName === 'Frames');
            this.categoryElements.set(resourceType.name(), categoryElement);
            this.appendChild(categoryElement, FrameTreeElement.presentationOrderCompare);
        }
        const resourceTreeElement = new FrameResourceTreeElement(this.section.panel, resource);
        categoryElement.appendChild(resourceTreeElement, FrameTreeElement.presentationOrderCompare);
        this.treeElementForResource.set(resource.url, resourceTreeElement);
    }
    windowOpened(targetInfo) {
        const categoryKey = 'OpenedWindows';
        let categoryElement = this.categoryElements.get(categoryKey);
        if (!categoryElement) {
            categoryElement = new ExpandableApplicationPanelTreeElement(this.section.panel, i18nString(UIStrings.openedWindows), categoryKey);
            this.categoryElements.set(categoryKey, categoryElement);
            this.appendChild(categoryElement, FrameTreeElement.presentationOrderCompare);
        }
        if (!this.treeElementForWindow.get(targetInfo.targetId)) {
            const windowTreeElement = new FrameWindowTreeElement(this.section.panel, targetInfo);
            categoryElement.appendChild(windowTreeElement);
            this.treeElementForWindow.set(targetInfo.targetId, windowTreeElement);
        }
    }
    workerCreated(targetInfo) {
        const categoryKey = targetInfo.type === 'service_worker' ? 'Service Workers' : 'Web Workers';
        const categoryName = targetInfo.type === 'service_worker' ? i18n.i18n.lockedString('Service Workers') :
            i18nString(UIStrings.webWorkers);
        let categoryElement = this.categoryElements.get(categoryKey);
        if (!categoryElement) {
            categoryElement = new ExpandableApplicationPanelTreeElement(this.section.panel, categoryName, categoryKey);
            this.categoryElements.set(categoryKey, categoryElement);
            this.appendChild(categoryElement, FrameTreeElement.presentationOrderCompare);
        }
        if (!this.treeElementForWorker.get(targetInfo.targetId)) {
            const workerTreeElement = new WorkerTreeElement(this.section.panel, targetInfo);
            categoryElement.appendChild(workerTreeElement);
            this.treeElementForWorker.set(targetInfo.targetId, workerTreeElement);
        }
    }
    windowChanged(targetInfo) {
        const windowTreeElement = this.treeElementForWindow.get(targetInfo.targetId);
        if (!windowTreeElement) {
            return;
        }
        if (windowTreeElement.title !== targetInfo.title) {
            windowTreeElement.title = targetInfo.title;
        }
        windowTreeElement.update(targetInfo);
    }
    windowDestroyed(targetId) {
        const windowTreeElement = this.treeElementForWindow.get(targetId);
        if (windowTreeElement) {
            windowTreeElement.windowClosed();
        }
    }
    appendChild(treeElement, comparator = FrameTreeElement.presentationOrderCompare) {
        super.appendChild(treeElement, comparator);
    }
    /**
     * Order elements by type (first frames, then resources, last Document resources)
     * and then each of these groups in the alphabetical order.
     */
    static presentationOrderCompare(treeElement1, treeElement2) {
        function typeWeight(treeElement) {
            if (treeElement instanceof ExpandableApplicationPanelTreeElement) {
                return 2;
            }
            if (treeElement instanceof FrameTreeElement) {
                return 1;
            }
            return 3;
        }
        const typeWeight1 = typeWeight(treeElement1);
        const typeWeight2 = typeWeight(treeElement2);
        return typeWeight1 - typeWeight2 || treeElement1.titleAsText().localeCompare(treeElement2.titleAsText());
    }
}
const resourceToFrameResourceTreeElement = new WeakMap();
export class FrameResourceTreeElement extends ApplicationPanelTreeElement {
    panel;
    resource;
    previewPromise;
    constructor(storagePanel, resource) {
        super(storagePanel, resource.isGenerated ? i18nString(UIStrings.documentNotAvailable) : resource.displayName, false);
        this.panel = storagePanel;
        this.resource = resource;
        this.previewPromise = null;
        this.tooltip = resource.url;
        resourceToFrameResourceTreeElement.set(this.resource, this);
        const icon = UI.Icon.Icon.create('mediumicon-manifest', 'navigator-file-tree-item');
        icon.classList.add('navigator-' + resource.resourceType().name() + '-tree-item');
        this.setLeadingIcons([icon]);
    }
    static forResource(resource) {
        return resourceToFrameResourceTreeElement.get(resource);
    }
    get itemURL() {
        return this.resource.url;
    }
    preparePreview() {
        if (this.previewPromise) {
            return this.previewPromise;
        }
        const viewPromise = SourceFrame.PreviewFactory.PreviewFactory.createPreview(this.resource, this.resource.mimeType);
        this.previewPromise = viewPromise.then(view => {
            if (view) {
                return view;
            }
            return new UI.EmptyWidget.EmptyWidget(this.resource.url);
        });
        return this.previewPromise;
    }
    onselect(selectedByUser) {
        super.onselect(selectedByUser);
        if (this.resource.isGenerated) {
            this.panel.showCategoryView(i18nString(UIStrings.theContentOfThisDocumentHasBeen), null);
        }
        else {
            void this.panel.scheduleShowView(this.preparePreview());
        }
        Host.userMetrics.panelShown(Host.UserMetrics.PanelCodes[Host.UserMetrics.PanelCodes.frame_resource]);
        return false;
    }
    ondblclick(_event) {
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.openInNewTab(this.resource.url);
        return false;
    }
    onattach() {
        super.onattach();
        this.listItemElement.draggable = true;
        this.listItemElement.addEventListener('dragstart', this.ondragstart.bind(this), false);
        this.listItemElement.addEventListener('contextmenu', this.handleContextMenuEvent.bind(this), true);
    }
    ondragstart(event) {
        if (!event.dataTransfer) {
            return false;
        }
        event.dataTransfer.setData('text/plain', this.resource.content || '');
        event.dataTransfer.effectAllowed = 'copy';
        return true;
    }
    handleContextMenuEvent(event) {
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        contextMenu.appendApplicableItems(this.resource);
        void contextMenu.show();
    }
    async revealResource(lineNumber, columnNumber) {
        this.revealAndSelect(true);
        const view = await this.panel.scheduleShowView(this.preparePreview());
        if (!(view instanceof SourceFrame.ResourceSourceFrame.ResourceSourceFrame) || typeof lineNumber !== 'number') {
            return;
        }
        view.revealPosition({ lineNumber, columnNumber }, true);
    }
}
class FrameWindowTreeElement extends ApplicationPanelTreeElement {
    targetInfo;
    isWindowClosed;
    view;
    constructor(storagePanel, targetInfo) {
        super(storagePanel, targetInfo.title || i18nString(UIStrings.windowWithoutTitle), false);
        this.targetInfo = targetInfo;
        this.isWindowClosed = false;
        this.view = null;
        this.updateIcon(targetInfo.canAccessOpener);
    }
    updateIcon(canAccessOpener) {
        const iconType = canAccessOpener ? 'mediumicon-frame-opened' : 'mediumicon-frame';
        const icon = UI.Icon.Icon.create(iconType);
        this.setLeadingIcons([icon]);
    }
    update(targetInfo) {
        if (targetInfo.canAccessOpener !== this.targetInfo.canAccessOpener) {
            this.updateIcon(targetInfo.canAccessOpener);
        }
        this.targetInfo = targetInfo;
        if (this.view) {
            this.view.setTargetInfo(targetInfo);
            this.view.update();
        }
    }
    windowClosed() {
        this.listItemElement.classList.add('window-closed');
        this.isWindowClosed = true;
        if (this.view) {
            this.view.setIsWindowClosed(true);
            this.view.update();
        }
    }
    onselect(selectedByUser) {
        super.onselect(selectedByUser);
        if (!this.view) {
            this.view = new OpenedWindowDetailsView(this.targetInfo, this.isWindowClosed);
        }
        else {
            this.view.update();
        }
        this.showView(this.view);
        Host.userMetrics.panelShown(Host.UserMetrics.PanelCodes[Host.UserMetrics.PanelCodes.frame_window]);
        return false;
    }
    get itemURL() {
        return this.targetInfo.url;
    }
}
class WorkerTreeElement extends ApplicationPanelTreeElement {
    targetInfo;
    view;
    constructor(storagePanel, targetInfo) {
        super(storagePanel, targetInfo.title || targetInfo.url || i18nString(UIStrings.worker), false);
        this.targetInfo = targetInfo;
        this.view = null;
        const icon = UI.Icon.Icon.create('mediumicon-service-worker', 'navigator-file-tree-item');
        this.setLeadingIcons([icon]);
    }
    onselect(selectedByUser) {
        super.onselect(selectedByUser);
        if (!this.view) {
            this.view = new WorkerDetailsView(this.targetInfo);
        }
        else {
            this.view.update();
        }
        this.showView(this.view);
        Host.userMetrics.panelShown(Host.UserMetrics.PanelCodes[Host.UserMetrics.PanelCodes.frame_worker]);
        return false;
    }
    get itemURL() {
        return this.targetInfo.url;
    }
}
//# sourceMappingURL=ApplicationPanelSidebar.js.map
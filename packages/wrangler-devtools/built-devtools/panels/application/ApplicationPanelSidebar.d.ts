import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Protocol from '../../generated/protocol.js';
import * as UI from '../../ui/legacy/legacy.js';
import { ServiceWorkerCacheTreeElement } from './ApplicationPanelCacheSection.js';
import { ApplicationPanelTreeElement, ExpandableApplicationPanelTreeElement } from './ApplicationPanelTreeElement.js';
import { BackgroundServiceModel } from './BackgroundServiceModel.js';
import type { Database as DatabaseModelDatabase } from './DatabaseModel.js';
import type { DOMStorage } from './DOMStorageModel.js';
import type { Database as IndexedDBModelDatabase, DatabaseId, Index, ObjectStore } from './IndexedDBModel.js';
import { IndexedDBModel } from './IndexedDBModel.js';
import { InterestGroupTreeElement } from './InterestGroupTreeElement.js';
import type { ResourcesPanel } from './ResourcesPanel.js';
import { TrustTokensTreeElement } from './TrustTokensTreeElement.js';
import { ReportingApiTreeElement } from './ReportingApiTreeElement.js';
export declare class ApplicationPanelSidebar extends UI.Widget.VBox implements SDK.TargetManager.Observer {
    panel: ResourcesPanel;
    private readonly sidebarTree;
    private readonly applicationTreeElement;
    serviceWorkersTreeElement: ServiceWorkersTreeElement;
    localStorageListTreeElement: ExpandableApplicationPanelTreeElement;
    sessionStorageListTreeElement: ExpandableApplicationPanelTreeElement;
    indexedDBListTreeElement: IndexedDBTreeElement;
    interestGroupTreeElement: InterestGroupTreeElement;
    databasesListTreeElement: ExpandableApplicationPanelTreeElement;
    cookieListTreeElement: ExpandableApplicationPanelTreeElement;
    trustTokensTreeElement: TrustTokensTreeElement;
    cacheStorageListTreeElement: ServiceWorkerCacheTreeElement;
    private backForwardCacheListTreeElement?;
    backgroundFetchTreeElement: BackgroundServiceTreeElement | undefined;
    backgroundSyncTreeElement: BackgroundServiceTreeElement | undefined;
    notificationsTreeElement: BackgroundServiceTreeElement | undefined;
    paymentHandlerTreeElement: BackgroundServiceTreeElement | undefined;
    periodicBackgroundSyncTreeElement: BackgroundServiceTreeElement | undefined;
    pushMessagingTreeElement: BackgroundServiceTreeElement | undefined;
    reportingApiTreeElement: ReportingApiTreeElement | undefined;
    private readonly resourcesSection;
    private readonly databaseTableViews;
    private databaseQueryViews;
    private readonly databaseTreeElements;
    private domStorageTreeElements;
    private domains;
    private target?;
    private databaseModel?;
    private previousHoveredElement?;
    constructor(panel: ResourcesPanel);
    private addSidebarSection;
    targetAdded(target: SDK.Target.Target): void;
    targetRemoved(target: SDK.Target.Target): void;
    focus(): void;
    private initialize;
    private domStorageModelAdded;
    private domStorageModelRemoved;
    private interestGroupModelAdded;
    private interestGroupModelRemoved;
    private resetWithFrames;
    private resetWebSQL;
    private treeElementAdded;
    private reset;
    private frameNavigated;
    private databaseAdded;
    private interestGroupAccess;
    private addCookieDocument;
    private domStorageAdded;
    private addDOMStorage;
    private domStorageRemoved;
    private removeDOMStorage;
    selectDatabase(database: DatabaseModelDatabase): void;
    showResource(resource: SDK.Resource.Resource, line?: number, column?: number): Promise<void>;
    showFrame(frame: SDK.ResourceTreeModel.ResourceTreeFrame): void;
    showDatabase(database: DatabaseModelDatabase, tableName?: string): void;
    showFileSystem(view: UI.Widget.Widget): void;
    private innerShowView;
    private updateDatabaseTables;
    private onmousemove;
    private onmouseleave;
    wasShown(): void;
}
export declare class BackgroundServiceTreeElement extends ApplicationPanelTreeElement {
    private serviceName;
    private view;
    private model;
    private selectedInternal;
    constructor(storagePanel: ResourcesPanel, serviceName: Protocol.BackgroundService.ServiceName);
    private getIconType;
    initialize(model: BackgroundServiceModel | null): void;
    get itemURL(): Platform.DevToolsPath.UrlString;
    onselect(selectedByUser?: boolean): boolean;
}
export declare class DatabaseTreeElement extends ApplicationPanelTreeElement {
    private readonly sidebar;
    private readonly database;
    constructor(sidebar: ApplicationPanelSidebar, database: DatabaseModelDatabase);
    get itemURL(): Platform.DevToolsPath.UrlString;
    onselect(selectedByUser?: boolean): boolean;
    onexpand(): void;
    updateChildren(): Promise<void>;
}
export declare class DatabaseTableTreeElement extends ApplicationPanelTreeElement {
    private readonly sidebar;
    private readonly database;
    private readonly tableName;
    constructor(sidebar: ApplicationPanelSidebar, database: DatabaseModelDatabase, tableName: string);
    get itemURL(): Platform.DevToolsPath.UrlString;
    onselect(selectedByUser?: boolean): boolean;
}
export declare class ServiceWorkersTreeElement extends ApplicationPanelTreeElement {
    private view?;
    constructor(storagePanel: ResourcesPanel);
    get itemURL(): Platform.DevToolsPath.UrlString;
    onselect(selectedByUser?: boolean): boolean;
}
export declare class AppManifestTreeElement extends ApplicationPanelTreeElement {
    private view?;
    constructor(storagePanel: ResourcesPanel);
    get itemURL(): Platform.DevToolsPath.UrlString;
    onselect(selectedByUser?: boolean): boolean;
}
export declare class ClearStorageTreeElement extends ApplicationPanelTreeElement {
    private view?;
    constructor(storagePanel: ResourcesPanel);
    get itemURL(): Platform.DevToolsPath.UrlString;
    onselect(selectedByUser?: boolean): boolean;
}
export declare class IndexedDBTreeElement extends ExpandableApplicationPanelTreeElement {
    private idbDatabaseTreeElements;
    constructor(storagePanel: ResourcesPanel);
    private initialize;
    removeIndexedDBForModel(model: IndexedDBModel): void;
    onattach(): void;
    private handleContextMenuEvent;
    refreshIndexedDB(): void;
    private indexedDBAdded;
    private addIndexedDB;
    private indexedDBRemoved;
    private removeIDBDatabaseTreeElement;
    private indexedDBLoaded;
    private indexedDBLoadedForTest;
    private indexedDBContentUpdated;
    private idbDatabaseTreeElement;
}
export declare class IDBDatabaseTreeElement extends ApplicationPanelTreeElement {
    model: IndexedDBModel;
    databaseId: DatabaseId;
    private readonly idbObjectStoreTreeElements;
    private database?;
    private view?;
    constructor(storagePanel: ResourcesPanel, model: IndexedDBModel, databaseId: DatabaseId);
    get itemURL(): Platform.DevToolsPath.UrlString;
    onattach(): void;
    private handleContextMenuEvent;
    private refreshIndexedDB;
    indexedDBContentUpdated(objectStoreName: string): void;
    update(database: IndexedDBModelDatabase, entriesUpdated: boolean): void;
    private updateTooltip;
    onselect(selectedByUser?: boolean): boolean;
    private objectStoreRemoved;
    clear(): void;
}
export declare class IDBObjectStoreTreeElement extends ApplicationPanelTreeElement {
    private model;
    private databaseId;
    private readonly idbIndexTreeElements;
    private objectStore;
    private view;
    constructor(storagePanel: ResourcesPanel, model: IndexedDBModel, databaseId: DatabaseId, objectStore: ObjectStore);
    get itemURL(): Platform.DevToolsPath.UrlString;
    onattach(): void;
    markNeedsRefresh(): void;
    private handleContextMenuEvent;
    private refreshObjectStore;
    private clearObjectStore;
    update(objectStore: ObjectStore, entriesUpdated: boolean): void;
    private updateTooltip;
    onselect(selectedByUser?: boolean): boolean;
    private indexRemoved;
    clear(): void;
}
export declare class IDBIndexTreeElement extends ApplicationPanelTreeElement {
    private model;
    private databaseId;
    private objectStore;
    private index;
    private refreshObjectStore;
    private view?;
    constructor(storagePanel: ResourcesPanel, model: IndexedDBModel, databaseId: DatabaseId, objectStore: ObjectStore, index: Index, refreshObjectStore: () => void);
    get itemURL(): Platform.DevToolsPath.UrlString;
    markNeedsRefresh(): void;
    refreshIndex(): void;
    update(objectStore: ObjectStore, index: Index, entriesUpdated: boolean): void;
    private updateTooltip;
    onselect(selectedByUser?: boolean): boolean;
    clear(): void;
}
export declare class DOMStorageTreeElement extends ApplicationPanelTreeElement {
    private readonly domStorage;
    constructor(storagePanel: ResourcesPanel, domStorage: DOMStorage);
    get itemURL(): Platform.DevToolsPath.UrlString;
    onselect(selectedByUser?: boolean): boolean;
    onattach(): void;
    private handleContextMenuEvent;
}
export declare class CookieTreeElement extends ApplicationPanelTreeElement {
    private readonly target;
    private readonly cookieDomainInternal;
    constructor(storagePanel: ResourcesPanel, frame: SDK.ResourceTreeModel.ResourceTreeFrame, cookieDomain: string);
    get itemURL(): Platform.DevToolsPath.UrlString;
    cookieDomain(): string;
    onattach(): void;
    private handleContextMenuEvent;
    onselect(selectedByUser?: boolean): boolean;
}
export declare class StorageCategoryView extends UI.Widget.VBox {
    private emptyWidget;
    private linkElement;
    constructor();
    setText(text: string): void;
    setLink(link: Platform.DevToolsPath.UrlString | null): void;
}
export declare class ResourcesSection implements SDK.TargetManager.Observer {
    panel: ResourcesPanel;
    private readonly treeElement;
    private treeElementForFrameId;
    private treeElementForTargetId;
    constructor(storagePanel: ResourcesPanel, treeElement: UI.TreeOutline.TreeElement);
    targetAdded(target: SDK.Target.Target): void;
    private workerAdded;
    targetRemoved(_target: SDK.Target.Target): void;
    private addFrameAndParents;
    private expandFrame;
    revealResource(resource: SDK.Resource.Resource, line?: number, column?: number): Promise<void>;
    revealAndSelectFrame(frame: SDK.ResourceTreeModel.ResourceTreeFrame): void;
    private frameAdded;
    private frameDetached;
    private frameNavigated;
    private resourceAdded;
    private windowOpened;
    private windowDestroyed;
    private windowChanged;
    reset(): void;
}
export declare class FrameTreeElement extends ApplicationPanelTreeElement {
    private section;
    private frame;
    private frameId;
    private readonly categoryElements;
    private readonly treeElementForResource;
    private treeElementForWindow;
    private treeElementForWorker;
    private view;
    constructor(section: ResourcesSection, frame: SDK.ResourceTreeModel.ResourceTreeFrame);
    getIconTypeForFrame(frame: SDK.ResourceTreeModel.ResourceTreeFrame): 'mediumicon-frame-blocked' | 'mediumicon-frame' | 'mediumicon-frame-embedded-blocked' | 'mediumicon-frame-embedded';
    frameNavigated(frame: SDK.ResourceTreeModel.ResourceTreeFrame): Promise<void>;
    get itemURL(): Platform.DevToolsPath.UrlString;
    onselect(selectedByUser?: boolean): boolean;
    set hovered(hovered: boolean);
    appendResource(resource: SDK.Resource.Resource): void;
    windowOpened(targetInfo: Protocol.Target.TargetInfo): void;
    workerCreated(targetInfo: Protocol.Target.TargetInfo): void;
    windowChanged(targetInfo: Protocol.Target.TargetInfo): void;
    windowDestroyed(targetId: Protocol.Target.TargetID): void;
    appendChild(treeElement: UI.TreeOutline.TreeElement, comparator?: ((arg0: UI.TreeOutline.TreeElement, arg1: UI.TreeOutline.TreeElement) => number) | undefined): void;
    /**
     * Order elements by type (first frames, then resources, last Document resources)
     * and then each of these groups in the alphabetical order.
     */
    private static presentationOrderCompare;
}
export declare class FrameResourceTreeElement extends ApplicationPanelTreeElement {
    private readonly panel;
    private resource;
    private previewPromise;
    constructor(storagePanel: ResourcesPanel, resource: SDK.Resource.Resource);
    static forResource(resource: SDK.Resource.Resource): FrameResourceTreeElement | undefined;
    get itemURL(): Platform.DevToolsPath.UrlString;
    private preparePreview;
    onselect(selectedByUser?: boolean): boolean;
    ondblclick(_event: Event): boolean;
    onattach(): void;
    private ondragstart;
    private handleContextMenuEvent;
    revealResource(lineNumber?: number, columnNumber?: number): Promise<void>;
}

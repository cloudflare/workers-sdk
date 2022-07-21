import type * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import { ApplicationPanelTreeElement, ExpandableApplicationPanelTreeElement } from './ApplicationPanelTreeElement.js';
import type { ResourcesPanel } from './ResourcesPanel.js';
export declare class ServiceWorkerCacheTreeElement extends ExpandableApplicationPanelTreeElement {
    private swCacheModel;
    private swCacheTreeElements;
    constructor(resourcesPanel: ResourcesPanel);
    initialize(model: SDK.ServiceWorkerCacheModel.ServiceWorkerCacheModel | null): void;
    onattach(): void;
    private handleContextMenuEvent;
    private refreshCaches;
    private cacheAdded;
    private addCache;
    private cacheRemoved;
    private cacheTreeElement;
}
export declare class SWCacheTreeElement extends ApplicationPanelTreeElement {
    private readonly model;
    private cache;
    private view;
    constructor(resourcesPanel: ResourcesPanel, model: SDK.ServiceWorkerCacheModel.ServiceWorkerCacheModel, cache: SDK.ServiceWorkerCacheModel.Cache);
    get itemURL(): Platform.DevToolsPath.UrlString;
    onattach(): void;
    private handleContextMenuEvent;
    private clearCache;
    update(cache: SDK.ServiceWorkerCacheModel.Cache): void;
    onselect(selectedByUser: boolean | undefined): boolean;
    hasModelAndCache(model: SDK.ServiceWorkerCacheModel.ServiceWorkerCacheModel, cache: SDK.ServiceWorkerCacheModel.Cache): boolean;
}
export declare class BackForwardCacheTreeElement extends ApplicationPanelTreeElement {
    private view?;
    constructor(resourcesPanel: ResourcesPanel);
    get itemURL(): Platform.DevToolsPath.UrlString;
    onselect(selectedByUser?: boolean): boolean;
}

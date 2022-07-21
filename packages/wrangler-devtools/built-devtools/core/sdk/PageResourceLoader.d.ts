import * as Common from '../common/common.js';
import * as Host from '../host/host.js';
import type * as Platform from '../platform/platform.js';
import type * as Protocol from '../../generated/protocol.js';
import type { ResourceTreeFrame } from './ResourceTreeModel.js';
import type { Target } from './Target.js';
export declare type PageResourceLoadInitiator = {
    target: null;
    frameId: Protocol.Page.FrameId;
    initiatorUrl: Platform.DevToolsPath.UrlString | null;
} | {
    target: Target;
    frameId: Protocol.Page.FrameId | null;
    initiatorUrl: Platform.DevToolsPath.UrlString | null;
};
export interface PageResource {
    success: boolean | null;
    errorMessage?: string;
    initiator: PageResourceLoadInitiator;
    url: Platform.DevToolsPath.UrlString;
    size: number | null;
}
/**
 * The page resource loader is a bottleneck for all DevTools-initiated resource loads. For each such load, it keeps a
 * `PageResource` object around that holds meta information. This can be as the basis for reporting to the user which
 * resources were loaded, and whether there was a load error.
 */
export declare class PageResourceLoader extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    constructor(loadOverride: ((arg0: string) => Promise<{
        success: boolean;
        content: string;
        errorDescription: Host.ResourceLoader.LoadErrorDescription;
    }>) | null, maxConcurrentLoads: number, loadTimeout: number);
    static instance({ forceNew, loadOverride, maxConcurrentLoads, loadTimeout }?: {
        forceNew: boolean;
        loadOverride: (null | ((arg0: string) => Promise<{
            success: boolean;
            content: string;
            errorDescription: Host.ResourceLoader.LoadErrorDescription;
        }>));
        maxConcurrentLoads: number;
        loadTimeout: number;
    }): PageResourceLoader;
    onMainFrameNavigated(event: Common.EventTarget.EventTargetEvent<ResourceTreeFrame>): void;
    getResourcesLoaded(): Map<string, PageResource>;
    /**
     * Loading is the number of currently loading and queued items. Resources is the total number of resources,
     * including loading and queued resources, but not including resources that are still loading but scheduled
     * for cancelation.;
     */
    getNumberOfResources(): {
        loading: number;
        queued: number;
        resources: number;
    };
    private acquireLoadSlot;
    private releaseLoadSlot;
    static withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T>;
    static makeKey(url: Platform.DevToolsPath.UrlString, initiator: PageResourceLoadInitiator): string;
    loadResource(url: Platform.DevToolsPath.UrlString, initiator: PageResourceLoadInitiator): Promise<{
        content: string;
    }>;
    private dispatchLoad;
    private getDeveloperResourceScheme;
    private loadFromTarget;
}
export declare function getLoadThroughTargetSetting(): Common.Settings.Setting<boolean>;
export declare enum Events {
    Update = "Update"
}
export declare type EventTypes = {
    [Events.Update]: void;
};

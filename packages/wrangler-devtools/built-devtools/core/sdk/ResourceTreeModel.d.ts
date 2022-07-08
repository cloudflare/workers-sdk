import * as Platform from '../platform/platform.js';
import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import * as Protocol from '../../generated/protocol.js';
import type { DeferredDOMNode, DOMNode } from './DOMModel.js';
import { DOMModel } from './DOMModel.js';
import type { NetworkRequest } from './NetworkRequest.js';
import { Resource } from './Resource.js';
import type { Target } from './Target.js';
import { SDKModel } from './SDKModel.js';
export declare class ResourceTreeModel extends SDKModel<EventTypes> {
    #private;
    readonly agent: ProtocolProxyApi.PageApi;
    readonly storageAgent: ProtocolProxyApi.StorageApi;
    readonly framesInternal: Map<string, ResourceTreeFrame>;
    isInterstitialShowing: boolean;
    mainFrame: ResourceTreeFrame | null;
    constructor(target: Target);
    static frameForRequest(request: NetworkRequest): ResourceTreeFrame | null;
    static frames(): ResourceTreeFrame[];
    static resourceForURL(url: Platform.DevToolsPath.UrlString): Resource | null;
    static reloadAllPages(bypassCache?: boolean, scriptToEvaluateOnLoad?: string): void;
    storageKeyForFrame(frameId: Protocol.Page.FrameId): Promise<string | null>;
    domModel(): DOMModel;
    private processCachedResources;
    cachedResourcesLoaded(): boolean;
    private addFrame;
    frameAttached(frameId: Protocol.Page.FrameId, parentFrameId: Protocol.Page.FrameId | null, stackTrace?: Protocol.Runtime.StackTrace, adScriptId?: Protocol.Page.AdScriptId): ResourceTreeFrame | null;
    frameNavigated(framePayload: Protocol.Page.Frame, type: Protocol.Page.NavigationType | undefined): void;
    documentOpened(framePayload: Protocol.Page.Frame): void;
    frameDetached(frameId: Protocol.Page.FrameId, isSwap: boolean): void;
    private onRequestFinished;
    private onRequestUpdateDropped;
    frameForId(frameId: Protocol.Page.FrameId): ResourceTreeFrame | null;
    forAllResources(callback: (arg0: Resource) => boolean): boolean;
    frames(): ResourceTreeFrame[];
    resourceForURL(url: Platform.DevToolsPath.UrlString): Resource | null;
    private addFramesRecursively;
    private createResourceFromFramePayload;
    suspendReload(): void;
    resumeReload(): void;
    reloadPage(ignoreCache?: boolean, scriptToEvaluateOnLoad?: string): void;
    navigate(url: Platform.DevToolsPath.UrlString): Promise<any>;
    navigationHistory(): Promise<{
        currentIndex: number;
        entries: Array<Protocol.Page.NavigationEntry>;
    } | null>;
    navigateToHistoryEntry(entry: Protocol.Page.NavigationEntry): void;
    setLifecycleEventsEnabled(enabled: boolean): Promise<Protocol.ProtocolResponseWithError>;
    fetchAppManifest(): Promise<{
        url: Platform.DevToolsPath.UrlString;
        data: string | null;
        errors: Array<Protocol.Page.AppManifestError>;
    }>;
    getInstallabilityErrors(): Promise<Protocol.Page.InstallabilityError[]>;
    getManifestIcons(): Promise<{
        primaryIcon: string | null;
    }>;
    getAppId(): Promise<Protocol.Page.GetAppIdResponse>;
    private executionContextComparator;
    private getSecurityOriginData;
    private getStorageKeyData;
    private updateSecurityOrigins;
    private updateStorageKeys;
    getMainStorageKey(): Promise<string | null>;
    getMainSecurityOrigin(): string | null;
    onBackForwardCacheNotUsed(event: Protocol.Page.BackForwardCacheNotUsedEvent): void;
    onPrerenderAttemptCompleted(event: Protocol.Page.PrerenderAttemptCompletedEvent): void;
    processPendingEvents(frame: ResourceTreeFrame): void;
}
export declare enum Events {
    FrameAdded = "FrameAdded",
    FrameNavigated = "FrameNavigated",
    FrameDetached = "FrameDetached",
    FrameResized = "FrameResized",
    FrameWillNavigate = "FrameWillNavigate",
    MainFrameNavigated = "MainFrameNavigated",
    ResourceAdded = "ResourceAdded",
    WillLoadCachedResources = "WillLoadCachedResources",
    CachedResourcesLoaded = "CachedResourcesLoaded",
    DOMContentLoaded = "DOMContentLoaded",
    LifecycleEvent = "LifecycleEvent",
    Load = "Load",
    PageReloadRequested = "PageReloadRequested",
    WillReloadPage = "WillReloadPage",
    InterstitialShown = "InterstitialShown",
    InterstitialHidden = "InterstitialHidden",
    BackForwardCacheDetailsUpdated = "BackForwardCacheDetailsUpdated",
    PrerenderingStatusUpdated = "PrerenderingStatusUpdated"
}
export declare type EventTypes = {
    [Events.FrameAdded]: ResourceTreeFrame;
    [Events.FrameNavigated]: ResourceTreeFrame;
    [Events.FrameDetached]: {
        frame: ResourceTreeFrame;
        isSwap: boolean;
    };
    [Events.FrameResized]: void;
    [Events.FrameWillNavigate]: ResourceTreeFrame;
    [Events.MainFrameNavigated]: ResourceTreeFrame;
    [Events.ResourceAdded]: Resource;
    [Events.WillLoadCachedResources]: void;
    [Events.CachedResourcesLoaded]: ResourceTreeModel;
    [Events.DOMContentLoaded]: number;
    [Events.LifecycleEvent]: {
        frameId: Protocol.Page.FrameId;
        name: string;
    };
    [Events.Load]: {
        resourceTreeModel: ResourceTreeModel;
        loadTime: number;
    };
    [Events.PageReloadRequested]: ResourceTreeModel;
    [Events.WillReloadPage]: void;
    [Events.InterstitialShown]: void;
    [Events.InterstitialHidden]: void;
    [Events.BackForwardCacheDetailsUpdated]: ResourceTreeFrame;
    [Events.PrerenderingStatusUpdated]: ResourceTreeFrame;
};
export declare class ResourceTreeFrame {
    #private;
    crossTargetParentFrameId: string | null;
    resourcesMap: Map<Platform.DevToolsPath.UrlString, Resource>;
    backForwardCacheDetails: {
        restoredFromCache: boolean | undefined;
        explanations: Protocol.Page.BackForwardCacheNotRestoredExplanation[];
        explanationsTree: Protocol.Page.BackForwardCacheNotRestoredExplanationTree | undefined;
    };
    prerenderFinalStatus: Protocol.Page.PrerenderFinalStatus | null;
    constructor(model: ResourceTreeModel, parentFrame: ResourceTreeFrame | null, frameId: Protocol.Page.FrameId, payload: Protocol.Page.Frame | null, creationStackTrace: Protocol.Runtime.StackTrace | null, adScriptId: Protocol.Page.AdScriptId | null);
    isSecureContext(): boolean;
    getSecureContextType(): Protocol.Page.SecureContextType | null;
    isCrossOriginIsolated(): boolean;
    getCrossOriginIsolatedContextType(): Protocol.Page.CrossOriginIsolatedContextType | null;
    getGatedAPIFeatures(): Protocol.Page.GatedAPIFeatures[] | null;
    getCreationStackTraceData(): {
        creationStackTrace: Protocol.Runtime.StackTrace | null;
        creationStackTraceTarget: Target;
    };
    navigate(framePayload: Protocol.Page.Frame): void;
    resourceTreeModel(): ResourceTreeModel;
    get id(): Protocol.Page.FrameId;
    get name(): string;
    get url(): Platform.DevToolsPath.UrlString;
    domainAndRegistry(): string;
    getAdScriptId(): Protocol.Runtime.ScriptId | null;
    setAdScriptId(adScriptId: Protocol.Runtime.ScriptId | null): void;
    getDebuggerId(): Protocol.Runtime.UniqueDebuggerId | null;
    setDebuggerId(debuggerId: Protocol.Runtime.UniqueDebuggerId | null): void;
    get securityOrigin(): string | null;
    get storageKey(): Promise<string | null>;
    unreachableUrl(): Platform.DevToolsPath.UrlString;
    get loaderId(): string;
    adFrameType(): Protocol.Page.AdFrameType;
    adFrameStatus(): Protocol.Page.AdFrameStatus | undefined;
    get childFrames(): ResourceTreeFrame[];
    /**
     * Returns the parent frame if both #frames are part of the same process/target.
     */
    sameTargetParentFrame(): ResourceTreeFrame | null;
    /**
     * Returns the parent frame if both #frames are part of different processes/targets (child is an OOPIF).
     */
    crossTargetParentFrame(): ResourceTreeFrame | null;
    /**
     * Returns the parent frame. There is only 1 parent and it's either in the
     * same target or it's cross-target.
     */
    parentFrame(): ResourceTreeFrame | null;
    /**
     * Returns true if this is the main frame of its target. For example, this returns true for the main frame
     * of an out-of-process iframe (OOPIF).
     */
    isMainFrame(): boolean;
    /**
     * Returns true if this is the top frame of the main target, i.e. if this is the top-most frame in the inspected
     * tab.
     */
    isTopFrame(): boolean;
    removeChildFrame(frame: ResourceTreeFrame, isSwap: boolean): void;
    private removeChildFrames;
    remove(isSwap: boolean): void;
    addResource(resource: Resource): void;
    addRequest(request: NetworkRequest): void;
    resources(): Resource[];
    resourceForURL(url: Platform.DevToolsPath.UrlString): Resource | null;
    callForFrameResources(callback: (arg0: Resource) => boolean): boolean;
    displayName(): string;
    getOwnerDeferredDOMNode(): Promise<DeferredDOMNode | null>;
    getOwnerDOMNodeOrDocument(): Promise<DOMNode | null>;
    highlight(): Promise<void>;
    getPermissionsPolicyState(): Promise<Protocol.Page.PermissionsPolicyFeatureState[] | null>;
    getOriginTrials(): Promise<Protocol.Page.OriginTrial[]>;
    setCreationStackTrace(creationStackTraceData: {
        creationStackTrace: Protocol.Runtime.StackTrace | null;
        creationStackTraceTarget: Target;
    }): void;
    setBackForwardCacheDetails(event: Protocol.Page.BackForwardCacheNotUsedEvent): void;
    getResourcesMap(): Map<string, Resource>;
    setPrerenderFinalStatus(status: Protocol.Page.PrerenderFinalStatus): void;
}
export declare class PageDispatcher implements ProtocolProxyApi.PageDispatcher {
    #private;
    constructor(resourceTreeModel: ResourceTreeModel);
    backForwardCacheNotUsed(params: Protocol.Page.BackForwardCacheNotUsedEvent): void;
    domContentEventFired({ timestamp }: Protocol.Page.DomContentEventFiredEvent): void;
    loadEventFired({ timestamp }: Protocol.Page.LoadEventFiredEvent): void;
    lifecycleEvent({ frameId, name }: Protocol.Page.LifecycleEventEvent): void;
    frameAttached({ frameId, parentFrameId, stack, adScriptId }: Protocol.Page.FrameAttachedEvent): void;
    frameNavigated({ frame, type }: Protocol.Page.FrameNavigatedEvent): void;
    documentOpened({ frame }: Protocol.Page.DocumentOpenedEvent): void;
    frameDetached({ frameId, reason }: Protocol.Page.FrameDetachedEvent): void;
    frameStartedLoading({}: Protocol.Page.FrameStartedLoadingEvent): void;
    frameStoppedLoading({}: Protocol.Page.FrameStoppedLoadingEvent): void;
    frameRequestedNavigation({}: Protocol.Page.FrameRequestedNavigationEvent): void;
    frameScheduledNavigation({}: Protocol.Page.FrameScheduledNavigationEvent): void;
    frameClearedScheduledNavigation({}: Protocol.Page.FrameClearedScheduledNavigationEvent): void;
    navigatedWithinDocument({}: Protocol.Page.NavigatedWithinDocumentEvent): void;
    frameResized(): void;
    javascriptDialogOpening({ hasBrowserHandler }: Protocol.Page.JavascriptDialogOpeningEvent): void;
    javascriptDialogClosed({}: Protocol.Page.JavascriptDialogClosedEvent): void;
    screencastFrame({}: Protocol.Page.ScreencastFrameEvent): void;
    screencastVisibilityChanged({}: Protocol.Page.ScreencastVisibilityChangedEvent): void;
    interstitialShown(): void;
    interstitialHidden(): void;
    windowOpen({}: Protocol.Page.WindowOpenEvent): void;
    compilationCacheProduced({}: Protocol.Page.CompilationCacheProducedEvent): void;
    fileChooserOpened({}: Protocol.Page.FileChooserOpenedEvent): void;
    downloadWillBegin({}: Protocol.Page.DownloadWillBeginEvent): void;
    downloadProgress(): void;
    prerenderAttemptCompleted(params: Protocol.Page.PrerenderAttemptCompletedEvent): void;
}
export interface SecurityOriginData {
    securityOrigins: Set<string>;
    mainSecurityOrigin: string | null;
    unreachableMainSecurityOrigin: string | null;
}
export interface StorageKeyData {
    storageKeys: Set<string>;
    mainStorageKey: string | null;
}

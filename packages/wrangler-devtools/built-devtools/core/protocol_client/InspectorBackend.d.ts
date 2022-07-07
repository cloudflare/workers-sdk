import type * as Platform from '../platform/platform.js';
import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
export declare const DevToolsStubErrorCode = -32015;
declare type MessageParams = {
    [x: string]: any;
};
declare type ProtocolDomainName = ProtocolProxyApi.ProtocolDomainName;
export interface MessageError {
    code: number;
    message: string;
    data?: string | null;
}
export declare type Message = {
    sessionId?: string;
    url?: Platform.DevToolsPath.UrlString;
    id?: number;
    error?: MessageError | null;
    result?: Object | null;
    method?: QualifiedName;
    params?: MessageParams | null;
};
interface EventMessage extends Message {
    method: QualifiedName;
    params?: MessageParams | null;
}
/** A qualified name, e.g. Domain.method */
export declare type QualifiedName = string & {
    qualifiedEventNameTag: string | undefined;
};
/** A qualified name, e.g. method */
export declare type UnqualifiedName = string & {
    unqualifiedEventNameTag: string | undefined;
};
export declare const splitQualifiedName: (string: QualifiedName) => [string, UnqualifiedName];
export declare const qualifyName: (domain: string, name: UnqualifiedName) => QualifiedName;
declare type EventParameterNames = Map<QualifiedName, string[]>;
declare type ReadonlyEventParameterNames = ReadonlyMap<QualifiedName, string[]>;
interface CommandParameter {
    name: string;
    type: string;
    optional: boolean;
}
declare type Callback = (error: MessageError | null, arg1: Object | null) => void;
interface CallbackWithDebugInfo {
    callback: Callback;
    method: string;
}
export declare class InspectorBackend {
    #private;
    readonly agentPrototypes: Map<ProtocolDomainName, _AgentPrototype>;
    private getOrCreateEventParameterNamesForDomain;
    getOrCreateEventParameterNamesForDomainForTesting(domain: ProtocolDomainName): EventParameterNames;
    getEventParamterNames(): ReadonlyMap<ProtocolDomainName, ReadonlyEventParameterNames>;
    static reportProtocolError(error: string, messageObject: Object): void;
    static reportProtocolWarning(error: string, messageObject: Object): void;
    isInitialized(): boolean;
    private agentPrototype;
    registerCommand(method: QualifiedName, parameters: CommandParameter[], replyArgs: string[]): void;
    registerEnum(type: QualifiedName, values: Object): void;
    registerEvent(eventName: QualifiedName, params: string[]): void;
}
export declare class Connection {
    onMessage: ((arg0: Object) => void) | null;
    constructor();
    setOnMessage(_onMessage: (arg0: (Object | string)) => void): void;
    setOnDisconnect(_onDisconnect: (arg0: string) => void): void;
    sendRawMessage(_message: string): void;
    disconnect(): Promise<void>;
    static setFactory(factory: () => Connection): void;
    static getFactory(): () => Connection;
}
declare type SendRawMessageCallback = (...args: unknown[]) => void;
export declare const test: {
    /**
     * This will get called for every protocol message.
     * ProtocolClient.test.dumpProtocol = console.log
     */
    dumpProtocol: ((arg0: string) => void) | null;
    /**
     * Runs a function when no protocol activity is present.
     * ProtocolClient.test.deprecatedRunAfterPendingDispatches(() => console.log('done'))
     */
    deprecatedRunAfterPendingDispatches: ((arg0: () => void) => void) | null;
    /**
     * Sends a raw message over main connection.
     * ProtocolClient.test.sendRawMessage('Page.enable', {}, console.log)
     */
    sendRawMessage: ((method: QualifiedName, args: Object | null, arg2: SendRawMessageCallback) => void) | null;
    /**
     * Set to true to not log any errors.
     */
    suppressRequestErrors: boolean;
    /**
     * Set to get notified about any messages sent over protocol.
     */
    onMessageSent: ((message: {
        domain: string;
        method: string;
        params: Object;
        id: number;
        sessionId?: string;
    }, target: TargetBase | null) => void) | null;
    /**
     * Set to get notified about any messages received over protocol.
     */
    onMessageReceived: ((message: Object, target: TargetBase | null) => void) | null;
};
export declare class SessionRouter {
    #private;
    constructor(connection: Connection);
    registerSession(target: TargetBase, sessionId: string, proxyConnection?: Connection | null): void;
    unregisterSession(sessionId: string): void;
    private getTargetBySessionId;
    private nextMessageId;
    connection(): Connection;
    sendMessage(sessionId: string, domain: string, method: QualifiedName, params: Object | null, callback: Callback): void;
    private sendRawMessageForTesting;
    private onMessage;
    private hasOutstandingNonLongPollingRequests;
    private deprecatedRunAfterPendingDispatches;
    private executeAfterPendingDispatches;
    static dispatchConnectionError(callback: Callback, method: string): void;
    static dispatchUnregisterSessionError({ callback, method }: CallbackWithDebugInfo): void;
}
export declare class TargetBase {
    #private;
    needsNodeJSPatching: boolean;
    readonly sessionId: string;
    routerInternal: SessionRouter | null;
    constructor(needsNodeJSPatching: boolean, parentTarget: TargetBase | null, sessionId: string, connection: Connection | null);
    dispatch(eventMessage: EventMessage): void;
    dispose(_reason: string): void;
    isDisposed(): boolean;
    markAsNodeJSForTest(): void;
    router(): SessionRouter | null;
    /**
     * Make sure that `Domain` is only ever instantiated with one protocol domain
     * name, because if `Domain` allows multiple domains, the type is unsound.
     */
    private getAgent;
    accessibilityAgent(): ProtocolProxyApi.AccessibilityApi;
    animationAgent(): ProtocolProxyApi.AnimationApi;
    auditsAgent(): ProtocolProxyApi.AuditsApi;
    browserAgent(): ProtocolProxyApi.BrowserApi;
    backgroundServiceAgent(): ProtocolProxyApi.BackgroundServiceApi;
    cacheStorageAgent(): ProtocolProxyApi.CacheStorageApi;
    cssAgent(): ProtocolProxyApi.CSSApi;
    databaseAgent(): ProtocolProxyApi.DatabaseApi;
    debuggerAgent(): ProtocolProxyApi.DebuggerApi;
    deviceOrientationAgent(): ProtocolProxyApi.DeviceOrientationApi;
    domAgent(): ProtocolProxyApi.DOMApi;
    domdebuggerAgent(): ProtocolProxyApi.DOMDebuggerApi;
    domsnapshotAgent(): ProtocolProxyApi.DOMSnapshotApi;
    domstorageAgent(): ProtocolProxyApi.DOMStorageApi;
    emulationAgent(): ProtocolProxyApi.EmulationApi;
    eventBreakpointsAgent(): ProtocolProxyApi.EventBreakpointsApi;
    fetchAgent(): ProtocolProxyApi.FetchApi;
    heapProfilerAgent(): ProtocolProxyApi.HeapProfilerApi;
    indexedDBAgent(): ProtocolProxyApi.IndexedDBApi;
    inputAgent(): ProtocolProxyApi.InputApi;
    ioAgent(): ProtocolProxyApi.IOApi;
    inspectorAgent(): ProtocolProxyApi.InspectorApi;
    layerTreeAgent(): ProtocolProxyApi.LayerTreeApi;
    logAgent(): ProtocolProxyApi.LogApi;
    mediaAgent(): ProtocolProxyApi.MediaApi;
    memoryAgent(): ProtocolProxyApi.MemoryApi;
    networkAgent(): ProtocolProxyApi.NetworkApi;
    overlayAgent(): ProtocolProxyApi.OverlayApi;
    pageAgent(): ProtocolProxyApi.PageApi;
    profilerAgent(): ProtocolProxyApi.ProfilerApi;
    performanceAgent(): ProtocolProxyApi.PerformanceApi;
    runtimeAgent(): ProtocolProxyApi.RuntimeApi;
    securityAgent(): ProtocolProxyApi.SecurityApi;
    serviceWorkerAgent(): ProtocolProxyApi.ServiceWorkerApi;
    storageAgent(): ProtocolProxyApi.StorageApi;
    targetAgent(): ProtocolProxyApi.TargetApi;
    tracingAgent(): ProtocolProxyApi.TracingApi;
    webAudioAgent(): ProtocolProxyApi.WebAudioApi;
    webAuthnAgent(): ProtocolProxyApi.WebAuthnApi;
    /**
     * Make sure that `Domain` is only ever instantiated with one protocol domain
     * name, because if `Domain` allows multiple domains, the type is unsound.
     */
    private registerDispatcher;
    /**
     * Make sure that `Domain` is only ever instantiated with one protocol domain
     * name, because if `Domain` allows multiple domains, the type is unsound.
     */
    private unregisterDispatcher;
    registerAccessibilityDispatcher(dispatcher: ProtocolProxyApi.AccessibilityDispatcher): void;
    registerAnimationDispatcher(dispatcher: ProtocolProxyApi.AnimationDispatcher): void;
    registerAuditsDispatcher(dispatcher: ProtocolProxyApi.AuditsDispatcher): void;
    registerCSSDispatcher(dispatcher: ProtocolProxyApi.CSSDispatcher): void;
    registerDatabaseDispatcher(dispatcher: ProtocolProxyApi.DatabaseDispatcher): void;
    registerBackgroundServiceDispatcher(dispatcher: ProtocolProxyApi.BackgroundServiceDispatcher): void;
    registerDebuggerDispatcher(dispatcher: ProtocolProxyApi.DebuggerDispatcher): void;
    unregisterDebuggerDispatcher(dispatcher: ProtocolProxyApi.DebuggerDispatcher): void;
    registerDOMDispatcher(dispatcher: ProtocolProxyApi.DOMDispatcher): void;
    registerDOMStorageDispatcher(dispatcher: ProtocolProxyApi.DOMStorageDispatcher): void;
    registerFetchDispatcher(dispatcher: ProtocolProxyApi.FetchDispatcher): void;
    registerHeapProfilerDispatcher(dispatcher: ProtocolProxyApi.HeapProfilerDispatcher): void;
    registerInspectorDispatcher(dispatcher: ProtocolProxyApi.InspectorDispatcher): void;
    registerLayerTreeDispatcher(dispatcher: ProtocolProxyApi.LayerTreeDispatcher): void;
    registerLogDispatcher(dispatcher: ProtocolProxyApi.LogDispatcher): void;
    registerMediaDispatcher(dispatcher: ProtocolProxyApi.MediaDispatcher): void;
    registerNetworkDispatcher(dispatcher: ProtocolProxyApi.NetworkDispatcher): void;
    registerOverlayDispatcher(dispatcher: ProtocolProxyApi.OverlayDispatcher): void;
    registerPageDispatcher(dispatcher: ProtocolProxyApi.PageDispatcher): void;
    registerProfilerDispatcher(dispatcher: ProtocolProxyApi.ProfilerDispatcher): void;
    registerRuntimeDispatcher(dispatcher: ProtocolProxyApi.RuntimeDispatcher): void;
    registerSecurityDispatcher(dispatcher: ProtocolProxyApi.SecurityDispatcher): void;
    registerServiceWorkerDispatcher(dispatcher: ProtocolProxyApi.ServiceWorkerDispatcher): void;
    registerStorageDispatcher(dispatcher: ProtocolProxyApi.StorageDispatcher): void;
    registerTargetDispatcher(dispatcher: ProtocolProxyApi.TargetDispatcher): void;
    registerTracingDispatcher(dispatcher: ProtocolProxyApi.TracingDispatcher): void;
    registerWebAudioDispatcher(dispatcher: ProtocolProxyApi.WebAudioDispatcher): void;
    getNeedsNodeJSPatching(): boolean;
}
/**
 * This is a class that serves as the prototype for a domains #agents (every target
 * has it's own set of #agents). The InspectorBackend keeps an instance of this class
 * per domain, and each TargetBase creates its #agents (via Object.create) and installs
 * this instance as prototype.
 *
 * The reasons this is done is so that on the prototypes we can install the implementations
 * of the invoke_enable, etc. methods that the front-end uses.
 */
declare class _AgentPrototype {
    replyArgs: {
        [x: string]: string[];
    };
    readonly domain: string;
    target: TargetBase;
    constructor(domain: string);
    registerCommand(methodName: UnqualifiedName, parameters: CommandParameter[], replyArgs: string[]): void;
    private prepareParameters;
    private sendMessageToBackendPromise;
    private invoke;
}
export declare const inspectorBackend: InspectorBackend;
export {};

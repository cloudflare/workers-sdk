import type * as TextUtils from '../../models/text_utils/text_utils.js';
import * as Common from '../common/common.js';
import * as Host from '../host/host.js';
import * as Platform from '../platform/platform.js';
import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import * as Protocol from '../../generated/protocol.js';
import type { ContentData } from './NetworkRequest.js';
import { NetworkRequest } from './NetworkRequest.js';
import type { Target } from './Target.js';
import { SDKModel } from './SDKModel.js';
import type { SDKModelObserver } from './TargetManager.js';
import type { Serializer } from '../common/Settings.js';
export declare class NetworkManager extends SDKModel<EventTypes> {
    #private;
    readonly dispatcher: NetworkDispatcher;
    readonly fetchDispatcher: FetchDispatcher;
    constructor(target: Target);
    static forRequest(request: NetworkRequest): NetworkManager | null;
    static canReplayRequest(request: NetworkRequest): boolean;
    static replayRequest(request: NetworkRequest): void;
    static searchInRequest(request: NetworkRequest, query: string, caseSensitive: boolean, isRegex: boolean): Promise<TextUtils.ContentProvider.SearchMatch[]>;
    static requestContentData(request: NetworkRequest): Promise<ContentData>;
    static requestPostData(request: NetworkRequest): Promise<string | null>;
    static connectionType(conditions: Conditions): Protocol.Network.ConnectionType;
    static lowercaseHeaders(headers: Protocol.Network.Headers): Protocol.Network.Headers;
    requestForURL(url: Platform.DevToolsPath.UrlString): NetworkRequest | null;
    requestforId(id: string): NetworkRequest | null;
    private cacheDisabledSettingChanged;
    dispose(): void;
    private bypassServiceWorkerChanged;
    getSecurityIsolationStatus(frameId: Protocol.Page.FrameId | null): Promise<Protocol.Network.SecurityIsolationStatus | null>;
    enableReportingApi(enable?: boolean): Promise<Promise<Protocol.ProtocolResponseWithError>>;
    loadNetworkResource(frameId: Protocol.Page.FrameId | null, url: Platform.DevToolsPath.UrlString, options: Protocol.Network.LoadNetworkResourceOptions): Promise<Protocol.Network.LoadNetworkResourcePageResult>;
    clearRequests(): void;
}
export declare enum Events {
    RequestStarted = "RequestStarted",
    RequestUpdated = "RequestUpdated",
    RequestFinished = "RequestFinished",
    RequestUpdateDropped = "RequestUpdateDropped",
    ResponseReceived = "ResponseReceived",
    MessageGenerated = "MessageGenerated",
    RequestRedirected = "RequestRedirected",
    LoadingFinished = "LoadingFinished",
    ReportingApiReportAdded = "ReportingApiReportAdded",
    ReportingApiReportUpdated = "ReportingApiReportUpdated",
    ReportingApiEndpointsChangedForOrigin = "ReportingApiEndpointsChangedForOrigin"
}
export interface RequestStartedEvent {
    request: NetworkRequest;
    originalRequest: Protocol.Network.Request | null;
}
export interface ResponseReceivedEvent {
    request: NetworkRequest;
    response: Protocol.Network.Response;
}
export interface MessageGeneratedEvent {
    message: Common.UIString.LocalizedString;
    requestId: string;
    warning: boolean;
}
export declare type EventTypes = {
    [Events.RequestStarted]: RequestStartedEvent;
    [Events.RequestUpdated]: NetworkRequest;
    [Events.RequestFinished]: NetworkRequest;
    [Events.RequestUpdateDropped]: RequestUpdateDroppedEventData;
    [Events.ResponseReceived]: ResponseReceivedEvent;
    [Events.MessageGenerated]: MessageGeneratedEvent;
    [Events.RequestRedirected]: NetworkRequest;
    [Events.LoadingFinished]: NetworkRequest;
    [Events.ReportingApiReportAdded]: Protocol.Network.ReportingApiReport;
    [Events.ReportingApiReportUpdated]: Protocol.Network.ReportingApiReport;
    [Events.ReportingApiEndpointsChangedForOrigin]: Protocol.Network.ReportingApiEndpointsChangedForOriginEvent;
};
export declare const NoThrottlingConditions: Conditions;
export declare const OfflineConditions: Conditions;
export declare const Slow3GConditions: Conditions;
export declare const Fast3GConditions: Conditions;
export declare class FetchDispatcher implements ProtocolProxyApi.FetchDispatcher {
    #private;
    constructor(agent: ProtocolProxyApi.FetchApi);
    requestPaused({ requestId, request, resourceType, responseStatusCode, responseHeaders }: Protocol.Fetch.RequestPausedEvent): void;
    authRequired({}: Protocol.Fetch.AuthRequiredEvent): void;
}
export declare class NetworkDispatcher implements ProtocolProxyApi.NetworkDispatcher {
    #private;
    constructor(manager: NetworkManager);
    private headersMapToHeadersArray;
    private updateNetworkRequestWithRequest;
    private updateNetworkRequestWithResponse;
    requestForId(id: string): NetworkRequest | null;
    requestForURL(url: Platform.DevToolsPath.UrlString): NetworkRequest | null;
    resourceChangedPriority({ requestId, newPriority }: Protocol.Network.ResourceChangedPriorityEvent): void;
    signedExchangeReceived({ requestId, info }: Protocol.Network.SignedExchangeReceivedEvent): void;
    requestWillBeSent({ requestId, loaderId, documentURL, request, timestamp, wallTime, initiator, redirectResponse, type, frameId }: Protocol.Network.RequestWillBeSentEvent): void;
    requestServedFromCache({ requestId }: Protocol.Network.RequestServedFromCacheEvent): void;
    responseReceived({ requestId, loaderId, timestamp, type, response, frameId }: Protocol.Network.ResponseReceivedEvent): void;
    dataReceived({ requestId, timestamp, dataLength, encodedDataLength }: Protocol.Network.DataReceivedEvent): void;
    loadingFinished({ requestId, timestamp: finishTime, encodedDataLength, shouldReportCorbBlocking }: Protocol.Network.LoadingFinishedEvent): void;
    loadingFailed({ requestId, timestamp: time, type: resourceType, errorText: localizedDescription, canceled, blockedReason, corsErrorStatus, }: Protocol.Network.LoadingFailedEvent): void;
    webSocketCreated({ requestId, url: requestURL, initiator }: Protocol.Network.WebSocketCreatedEvent): void;
    webSocketWillSendHandshakeRequest({ requestId, timestamp: time, wallTime, request }: Protocol.Network.WebSocketWillSendHandshakeRequestEvent): void;
    webSocketHandshakeResponseReceived({ requestId, timestamp: time, response }: Protocol.Network.WebSocketHandshakeResponseReceivedEvent): void;
    webSocketFrameReceived({ requestId, timestamp: time, response }: Protocol.Network.WebSocketFrameReceivedEvent): void;
    webSocketFrameSent({ requestId, timestamp: time, response }: Protocol.Network.WebSocketFrameSentEvent): void;
    webSocketFrameError({ requestId, timestamp: time, errorMessage }: Protocol.Network.WebSocketFrameErrorEvent): void;
    webSocketClosed({ requestId, timestamp: time }: Protocol.Network.WebSocketClosedEvent): void;
    eventSourceMessageReceived({ requestId, timestamp: time, eventName, eventId, data }: Protocol.Network.EventSourceMessageReceivedEvent): void;
    requestIntercepted({}: Protocol.Network.RequestInterceptedEvent): void;
    requestWillBeSentExtraInfo({ requestId, associatedCookies, headers, clientSecurityState, connectTiming }: Protocol.Network.RequestWillBeSentExtraInfoEvent): void;
    responseReceivedExtraInfo({ requestId, blockedCookies, headers, headersText, resourceIPAddressSpace, statusCode }: Protocol.Network.ResponseReceivedExtraInfoEvent): void;
    private getExtraInfoBuilder;
    private appendRedirect;
    private maybeAdoptMainResourceRequest;
    private startNetworkRequest;
    private updateNetworkRequest;
    private finishNetworkRequest;
    clearRequests(): void;
    webTransportCreated({ transportId, url: requestURL, timestamp: time, initiator }: Protocol.Network.WebTransportCreatedEvent): void;
    webTransportConnectionEstablished({ transportId, timestamp: time }: Protocol.Network.WebTransportConnectionEstablishedEvent): void;
    webTransportClosed({ transportId, timestamp: time }: Protocol.Network.WebTransportClosedEvent): void;
    trustTokenOperationDone(event: Protocol.Network.TrustTokenOperationDoneEvent): void;
    subresourceWebBundleMetadataReceived({ requestId, urls }: Protocol.Network.SubresourceWebBundleMetadataReceivedEvent): void;
    subresourceWebBundleMetadataError({ requestId, errorMessage }: Protocol.Network.SubresourceWebBundleMetadataErrorEvent): void;
    subresourceWebBundleInnerResponseParsed({ innerRequestId, bundleRequestId }: Protocol.Network.SubresourceWebBundleInnerResponseParsedEvent): void;
    subresourceWebBundleInnerResponseError({ innerRequestId, errorMessage }: Protocol.Network.SubresourceWebBundleInnerResponseErrorEvent): void;
    reportingApiReportAdded(data: Protocol.Network.ReportingApiReportAddedEvent): void;
    reportingApiReportUpdated(data: Protocol.Network.ReportingApiReportUpdatedEvent): void;
    reportingApiEndpointsChangedForOrigin(data: Protocol.Network.ReportingApiEndpointsChangedForOriginEvent): void;
    /**
     * @deprecated
     * This method is only kept for usage in a web test.
     */
    private createNetworkRequest;
}
export declare class MultitargetNetworkManager extends Common.ObjectWrapper.ObjectWrapper<MultitargetNetworkManager.EventTypes> implements SDKModelObserver<NetworkManager> {
    #private;
    readonly inflightMainResourceRequests: Map<string, NetworkRequest>;
    constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    }): MultitargetNetworkManager;
    static getChromeVersion(): string;
    static patchUserAgentWithChromeVersion(uaString: string): string;
    static patchUserAgentMetadataWithChromeVersion(userAgentMetadata: Protocol.Emulation.UserAgentMetadata): void;
    modelAdded(networkManager: NetworkManager): void;
    modelRemoved(networkManager: NetworkManager): void;
    isThrottling(): boolean;
    isOffline(): boolean;
    setNetworkConditions(conditions: Conditions): void;
    networkConditions(): Conditions;
    private updateNetworkConditions;
    setExtraHTTPHeaders(headers: Protocol.Network.Headers): void;
    currentUserAgent(): string;
    private updateUserAgentOverride;
    setUserAgentOverride(userAgent: string, userAgentMetadataOverride: Protocol.Emulation.UserAgentMetadata | null): void;
    userAgentOverride(): string;
    setCustomUserAgentOverride(userAgent: string, userAgentMetadataOverride?: Protocol.Emulation.UserAgentMetadata | null): void;
    setCustomAcceptedEncodingsOverride(acceptedEncodings: Protocol.Network.ContentEncoding[]): void;
    clearCustomAcceptedEncodingsOverride(): void;
    isAcceptedEncodingOverrideSet(): boolean;
    private updateAcceptedEncodingsOverride;
    blockedPatterns(): BlockedPattern[];
    blockingEnabled(): boolean;
    isBlocking(): boolean;
    setBlockedPatterns(patterns: BlockedPattern[]): void;
    setBlockingEnabled(enabled: boolean): void;
    private updateBlockedPatterns;
    isIntercepting(): boolean;
    setInterceptionHandlerForPatterns(patterns: InterceptionPattern[], requestInterceptor: (arg0: InterceptedRequest) => Promise<void>): Promise<void>;
    private updateInterceptionPatternsOnNextTick;
    private updateInterceptionPatterns;
    requestIntercepted(interceptedRequest: InterceptedRequest): Promise<void>;
    clearBrowserCache(): void;
    clearBrowserCookies(): void;
    getCertificate(origin: string): Promise<string[]>;
    loadResource(url: Platform.DevToolsPath.UrlString): Promise<{
        success: boolean;
        content: string;
        errorDescription: Host.ResourceLoader.LoadErrorDescription;
    }>;
}
export declare namespace MultitargetNetworkManager {
    enum Events {
        BlockedPatternsChanged = "BlockedPatternsChanged",
        ConditionsChanged = "ConditionsChanged",
        UserAgentChanged = "UserAgentChanged",
        InterceptorsChanged = "InterceptorsChanged",
        AcceptedEncodingsChanged = "AcceptedEncodingsChanged",
        RequestIntercepted = "RequestIntercepted"
    }
    type EventTypes = {
        [Events.BlockedPatternsChanged]: void;
        [Events.ConditionsChanged]: void;
        [Events.UserAgentChanged]: void;
        [Events.InterceptorsChanged]: void;
        [Events.AcceptedEncodingsChanged]: void;
        [Events.RequestIntercepted]: Platform.DevToolsPath.UrlString;
    };
}
export declare class InterceptedRequest {
    #private;
    request: Protocol.Network.Request;
    resourceType: Protocol.Network.ResourceType;
    responseStatusCode: number | undefined;
    responseHeaders: Protocol.Fetch.HeaderEntry[] | undefined;
    requestId: Protocol.Fetch.RequestId;
    constructor(fetchAgent: ProtocolProxyApi.FetchApi, request: Protocol.Network.Request, resourceType: Protocol.Network.ResourceType, requestId: Protocol.Fetch.RequestId, responseStatusCode?: number, responseHeaders?: Protocol.Fetch.HeaderEntry[]);
    hasResponded(): boolean;
    continueRequestWithContent(contentBlob: Blob, encoded: boolean, responseHeaders: Protocol.Fetch.HeaderEntry[]): Promise<void>;
    continueRequestWithoutChange(): void;
    continueRequestWithError(errorReason: Protocol.Network.ErrorReason): void;
    responseBody(): Promise<ContentData>;
}
export declare class ConditionsSerializer implements Serializer<Conditions, Conditions> {
    stringify(value: unknown): string;
    parse(serialized: string): Conditions;
}
export declare function networkConditionsEqual(first: Conditions, second: Conditions): boolean;
export interface Conditions {
    download: number;
    upload: number;
    latency: number;
    title: string | (() => string);
    i18nTitleKey?: string;
}
export interface BlockedPattern {
    url: string;
    enabled: boolean;
}
export interface Message {
    message: string;
    requestId: string;
    warning: boolean;
}
export interface InterceptionPattern {
    urlPattern: string;
    requestStage: Protocol.Fetch.RequestStage;
}
export declare type RequestInterceptor = (request: InterceptedRequest) => Promise<void>;
export interface RequestUpdateDroppedEventData {
    url: Platform.DevToolsPath.UrlString;
    frameId: Protocol.Page.FrameId | null;
    loaderId: Protocol.Network.LoaderId;
    resourceType: Protocol.Network.ResourceType;
    mimeType: string;
    lastModified: Date | null;
}

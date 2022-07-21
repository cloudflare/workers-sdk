import * as Protocol from '../../generated/protocol.js';
import * as TextUtils from '../../models/text_utils/text_utils.js';
import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import type { Cookie } from './Cookie.js';
import { Attributes } from './Cookie.js';
import { ServerTiming } from './ServerTiming.js';
export declare enum MIME_TYPE {
    HTML = "text/html",
    XML = "text/xml",
    PLAIN = "text/plain",
    XHTML = "application/xhtml+xml",
    SVG = "image/svg+xml",
    CSS = "text/css",
    XSL = "text/xsl",
    VTT = "text/vtt",
    PDF = "application/pdf",
    EVENTSTREAM = "text/event-stream"
}
export declare class NetworkRequest extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements TextUtils.ContentProvider.ContentProvider {
    #private;
    statusCode: number;
    statusText: string;
    requestMethod: string;
    requestTime: number;
    protocol: string;
    mixedContentType: Protocol.Security.MixedContentType;
    connectionId: string;
    connectionReused: boolean;
    hasNetworkData: boolean;
    localizedFailDescription: string | null;
    private constructor();
    static create(backendRequestId: Protocol.Network.RequestId, url: Platform.DevToolsPath.UrlString, documentURL: Platform.DevToolsPath.UrlString, frameId: Protocol.Page.FrameId | null, loaderId: Protocol.Network.LoaderId | null, initiator: Protocol.Network.Initiator | null): NetworkRequest;
    static createForWebSocket(backendRequestId: Protocol.Network.RequestId, requestURL: Platform.DevToolsPath.UrlString, initiator?: Protocol.Network.Initiator): NetworkRequest;
    static createWithoutBackendRequest(requestId: string, url: Platform.DevToolsPath.UrlString, documentURL: Platform.DevToolsPath.UrlString, initiator: Protocol.Network.Initiator | null): NetworkRequest;
    identityCompare(other: NetworkRequest): number;
    requestId(): string;
    backendRequestId(): Protocol.Network.RequestId | undefined;
    url(): Platform.DevToolsPath.UrlString;
    isBlobRequest(): boolean;
    setUrl(x: Platform.DevToolsPath.UrlString): void;
    get documentURL(): Platform.DevToolsPath.UrlString;
    get parsedURL(): Common.ParsedURL.ParsedURL;
    get frameId(): Protocol.Page.FrameId | null;
    get loaderId(): Protocol.Network.LoaderId | null;
    setRemoteAddress(ip: string, port: number): void;
    remoteAddress(): string;
    remoteAddressSpace(): Protocol.Network.IPAddressSpace;
    /**
     * The cache #name of the CacheStorage from where the response is served via
     * the ServiceWorker.
     */
    getResponseCacheStorageCacheName(): string | undefined;
    setResponseCacheStorageCacheName(x: string): void;
    serviceWorkerResponseSource(): Protocol.Network.ServiceWorkerResponseSource | undefined;
    setServiceWorkerResponseSource(serviceWorkerResponseSource: Protocol.Network.ServiceWorkerResponseSource): void;
    setReferrerPolicy(referrerPolicy: Protocol.Network.RequestReferrerPolicy): void;
    referrerPolicy(): Protocol.Network.RequestReferrerPolicy | null;
    securityState(): Protocol.Security.SecurityState;
    setSecurityState(securityState: Protocol.Security.SecurityState): void;
    securityDetails(): Protocol.Network.SecurityDetails | null;
    securityOrigin(): string;
    setSecurityDetails(securityDetails: Protocol.Network.SecurityDetails): void;
    get startTime(): number;
    setIssueTime(monotonicTime: number, wallTime: number): void;
    issueTime(): number;
    pseudoWallTime(monotonicTime: number): number;
    get responseReceivedTime(): number;
    set responseReceivedTime(x: number);
    /**
     * The time at which the returned response was generated. For cached
     * responses, this is the last time the cache entry was validated.
     */
    getResponseRetrievalTime(): Date | undefined;
    setResponseRetrievalTime(x: Date): void;
    get endTime(): number;
    set endTime(x: number);
    get duration(): number;
    get latency(): number;
    get resourceSize(): number;
    set resourceSize(x: number);
    get transferSize(): number;
    increaseTransferSize(x: number): void;
    setTransferSize(x: number): void;
    get finished(): boolean;
    set finished(x: boolean);
    get failed(): boolean;
    set failed(x: boolean);
    get canceled(): boolean;
    set canceled(x: boolean);
    get preserved(): boolean;
    set preserved(x: boolean);
    blockedReason(): Protocol.Network.BlockedReason | undefined;
    setBlockedReason(reason: Protocol.Network.BlockedReason): void;
    corsErrorStatus(): Protocol.Network.CorsErrorStatus | undefined;
    setCorsErrorStatus(corsErrorStatus: Protocol.Network.CorsErrorStatus): void;
    wasBlocked(): boolean;
    cached(): boolean;
    cachedInMemory(): boolean;
    fromPrefetchCache(): boolean;
    setFromMemoryCache(): void;
    get fromDiskCache(): boolean | undefined;
    setFromDiskCache(): void;
    setFromPrefetchCache(): void;
    /**
     * Returns true if the request was intercepted by a service worker and it
     * provided its own response.
     */
    get fetchedViaServiceWorker(): boolean;
    set fetchedViaServiceWorker(x: boolean);
    /**
     * Returns true if the request was sent by a service worker.
     */
    initiatedByServiceWorker(): boolean;
    get timing(): Protocol.Network.ResourceTiming | undefined;
    set timing(timingInfo: Protocol.Network.ResourceTiming | undefined);
    private setConnectTimingFromExtraInfo;
    get mimeType(): MIME_TYPE;
    set mimeType(x: MIME_TYPE);
    get displayName(): string;
    name(): string;
    path(): string;
    private parseNameAndPathFromURL;
    get folder(): string;
    get pathname(): string;
    resourceType(): Common.ResourceType.ResourceType;
    setResourceType(resourceType: Common.ResourceType.ResourceType): void;
    get domain(): string;
    get scheme(): string;
    redirectSource(): NetworkRequest | null;
    setRedirectSource(originatingRequest: NetworkRequest | null): void;
    preflightRequest(): NetworkRequest | null;
    setPreflightRequest(preflightRequest: NetworkRequest | null): void;
    preflightInitiatorRequest(): NetworkRequest | null;
    setPreflightInitiatorRequest(preflightInitiatorRequest: NetworkRequest | null): void;
    isPreflightRequest(): boolean;
    redirectDestination(): NetworkRequest | null;
    setRedirectDestination(redirectDestination: NetworkRequest | null): void;
    requestHeaders(): NameValue[];
    setRequestHeaders(headers: NameValue[]): void;
    requestHeadersText(): string | undefined;
    setRequestHeadersText(text: string): void;
    requestHeaderValue(headerName: string): string | undefined;
    requestFormData(): Promise<string | null>;
    setRequestFormData(hasData: boolean, data: string | null): void;
    private filteredProtocolName;
    requestHttpVersion(): string;
    get responseHeaders(): NameValue[];
    set responseHeaders(x: NameValue[]);
    get responseHeadersText(): string;
    set responseHeadersText(x: string);
    get sortedResponseHeaders(): NameValue[];
    responseHeaderValue(headerName: string): string | undefined;
    wasIntercepted(): boolean;
    setWasIntercepted(wasIntercepted: boolean): void;
    get responseCookies(): Cookie[];
    responseLastModified(): string | undefined;
    allCookiesIncludingBlockedOnes(): Cookie[];
    get serverTimings(): ServerTiming[] | null;
    queryString(): string | null;
    get queryParameters(): NameValue[] | null;
    private parseFormParameters;
    formParameters(): Promise<NameValue[] | null>;
    responseHttpVersion(): string;
    private parseParameters;
    /**
     * Parses multipart/form-data; boundary=boundaryString request bodies -
     * --boundaryString
     * Content-Disposition: form-data; #name="field-#name"; filename="r.gif"
     * Content-Type: application/octet-stream
     *
     * optionalValue
     * --boundaryString
     * Content-Disposition: form-data; #name="field-#name-2"
     *
     * optionalValue2
     * --boundaryString--
     */
    private parseMultipartFormDataParameters;
    private computeHeaderValue;
    contentData(): Promise<ContentData>;
    setContentDataProvider(dataProvider: () => Promise<ContentData>): void;
    contentURL(): Platform.DevToolsPath.UrlString;
    contentType(): Common.ResourceType.ResourceType;
    contentEncoded(): Promise<boolean>;
    requestContent(): Promise<TextUtils.ContentProvider.DeferredContent>;
    searchInContent(query: string, caseSensitive: boolean, isRegex: boolean): Promise<TextUtils.ContentProvider.SearchMatch[]>;
    isHttpFamily(): boolean;
    requestContentType(): string | undefined;
    hasErrorStatusCode(): boolean;
    setInitialPriority(priority: Protocol.Network.ResourcePriority): void;
    initialPriority(): Protocol.Network.ResourcePriority | null;
    setPriority(priority: Protocol.Network.ResourcePriority): void;
    priority(): Protocol.Network.ResourcePriority | null;
    setSignedExchangeInfo(info: Protocol.Network.SignedExchangeInfo): void;
    signedExchangeInfo(): Protocol.Network.SignedExchangeInfo | null;
    setWebBundleInfo(info: WebBundleInfo | null): void;
    webBundleInfo(): WebBundleInfo | null;
    setWebBundleInnerRequestInfo(info: WebBundleInnerRequestInfo | null): void;
    webBundleInnerRequestInfo(): WebBundleInnerRequestInfo | null;
    populateImageSource(image: HTMLImageElement): Promise<void>;
    initiator(): Protocol.Network.Initiator | null;
    frames(): WebSocketFrame[];
    addProtocolFrameError(errorMessage: string, time: number): void;
    addProtocolFrame(response: Protocol.Network.WebSocketFrame, time: number, sent: boolean): void;
    addFrame(frame: WebSocketFrame): void;
    eventSourceMessages(): EventSourceMessage[];
    addEventSourceMessage(time: number, eventName: string, eventId: string, data: string): void;
    markAsRedirect(redirectCount: number): void;
    isRedirect(): boolean;
    setRequestIdForTest(requestId: Protocol.Network.RequestId): void;
    charset(): string | null;
    addExtraRequestInfo(extraRequestInfo: ExtraRequestInfo): void;
    hasExtraRequestInfo(): boolean;
    blockedRequestCookies(): BlockedCookieWithReason[];
    includedRequestCookies(): Cookie[];
    hasRequestCookies(): boolean;
    addExtraResponseInfo(extraResponseInfo: ExtraResponseInfo): void;
    hasExtraResponseInfo(): boolean;
    blockedResponseCookies(): BlockedSetCookieWithReason[];
    redirectSourceSignedExchangeInfoHasNoErrors(): boolean;
    clientSecurityState(): Protocol.Network.ClientSecurityState | undefined;
    setTrustTokenParams(trustTokenParams: Protocol.Network.TrustTokenParams): void;
    trustTokenParams(): Protocol.Network.TrustTokenParams | undefined;
    setTrustTokenOperationDoneEvent(doneEvent: Protocol.Network.TrustTokenOperationDoneEvent): void;
    trustTokenOperationDoneEvent(): Protocol.Network.TrustTokenOperationDoneEvent | undefined;
    setIsSameSite(isSameSite: boolean): void;
    isSameSite(): boolean | null;
}
export declare enum Events {
    FinishedLoading = "FinishedLoading",
    TimingChanged = "TimingChanged",
    RemoteAddressChanged = "RemoteAddressChanged",
    RequestHeadersChanged = "RequestHeadersChanged",
    ResponseHeadersChanged = "ResponseHeadersChanged",
    WebsocketFrameAdded = "WebsocketFrameAdded",
    EventSourceMessageAdded = "EventSourceMessageAdded",
    TrustTokenResultAdded = "TrustTokenResultAdded"
}
export declare type EventTypes = {
    [Events.FinishedLoading]: NetworkRequest;
    [Events.TimingChanged]: NetworkRequest;
    [Events.RemoteAddressChanged]: NetworkRequest;
    [Events.RequestHeadersChanged]: void;
    [Events.ResponseHeadersChanged]: void;
    [Events.WebsocketFrameAdded]: WebSocketFrame;
    [Events.EventSourceMessageAdded]: EventSourceMessage;
    [Events.TrustTokenResultAdded]: void;
};
export declare enum InitiatorType {
    Other = "other",
    Parser = "parser",
    Redirect = "redirect",
    Script = "script",
    Preload = "preload",
    SignedExchange = "signedExchange",
    Preflight = "preflight"
}
export declare enum WebSocketFrameType {
    Send = "send",
    Receive = "receive",
    Error = "error"
}
export declare const cookieBlockedReasonToUiString: (blockedReason: Protocol.Network.CookieBlockedReason) => string;
export declare const setCookieBlockedReasonToUiString: (blockedReason: Protocol.Network.SetCookieBlockedReason) => string;
export declare const cookieBlockedReasonToAttribute: (blockedReason: Protocol.Network.CookieBlockedReason) => Attributes | null;
export declare const setCookieBlockedReasonToAttribute: (blockedReason: Protocol.Network.SetCookieBlockedReason) => Attributes | null;
export interface NameValue {
    name: string;
    value: string;
}
export interface WebSocketFrame {
    type: WebSocketFrameType;
    time: number;
    text: string;
    opCode: number;
    mask: boolean;
}
export interface BlockedSetCookieWithReason {
    blockedReasons: Protocol.Network.SetCookieBlockedReason[];
    cookieLine: string;
    cookie: Cookie | null;
}
export interface BlockedCookieWithReason {
    blockedReasons: Protocol.Network.CookieBlockedReason[];
    cookie: Cookie;
}
export interface ContentData {
    error: string | null;
    content: string | null;
    encoded: boolean;
}
export interface EventSourceMessage {
    time: number;
    eventName: string;
    eventId: string;
    data: string;
}
export interface ExtraRequestInfo {
    blockedRequestCookies: {
        blockedReasons: Protocol.Network.CookieBlockedReason[];
        cookie: Cookie;
    }[];
    requestHeaders: NameValue[];
    includedRequestCookies: Cookie[];
    clientSecurityState?: Protocol.Network.ClientSecurityState;
    connectTiming: Protocol.Network.ConnectTiming;
}
export interface ExtraResponseInfo {
    blockedResponseCookies: {
        blockedReasons: Protocol.Network.SetCookieBlockedReason[];
        cookieLine: string;
        cookie: Cookie | null;
    }[];
    responseHeaders: NameValue[];
    responseHeadersText?: string;
    resourceIPAddressSpace: Protocol.Network.IPAddressSpace;
    statusCode: number | undefined;
}
export interface WebBundleInfo {
    resourceUrls?: Platform.DevToolsPath.UrlString[];
    errorMessage?: string;
}
export interface WebBundleInnerRequestInfo {
    bundleRequestId?: string;
    errorMessage?: string;
}

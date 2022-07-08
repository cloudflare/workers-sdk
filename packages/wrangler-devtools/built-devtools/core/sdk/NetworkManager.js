// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Host from '../host/host.js';
import * as i18n from '../i18n/i18n.js';
import * as Platform from '../platform/platform.js';
import { Cookie } from './Cookie.js';
import { Events as NetworkRequestEvents, NetworkRequest } from './NetworkRequest.js';
import { Capability } from './Target.js';
import { SDKModel } from './SDKModel.js';
import { TargetManager } from './TargetManager.js';
const UIStrings = {
    /**
    *@description Explanation why no content is shown for WebSocket connection.
    */
    noContentForWebSocket: 'Content for WebSockets is currently not supported',
    /**
    *@description Explanation why no content is shown for redirect response.
    */
    noContentForRedirect: 'No content available because this request was redirected',
    /**
    *@description Explanation why no content is shown for preflight request.
    */
    noContentForPreflight: 'No content available for preflight request',
    /**
    *@description Text to indicate that network throttling is disabled
    */
    noThrottling: 'No throttling',
    /**
    *@description Text to indicate the network connectivity is offline
    */
    offline: 'Offline',
    /**
    *@description Text in Network Manager
    */
    slowG: 'Slow 3G',
    /**
    *@description Text in Network Manager
    */
    fastG: 'Fast 3G',
    /**
    *@description Text in Network Manager
    *@example {https://example.com} PH1
    */
    requestWasBlockedByDevtoolsS: 'Request was blocked by DevTools: "{PH1}"',
    /**
    *@description Text in Network Manager
    *@example {https://example.com} PH1
    *@example {application} PH2
    */
    crossoriginReadBlockingCorb: 'Cross-Origin Read Blocking (CORB) blocked cross-origin response {PH1} with MIME type {PH2}. See https://www.chromestatus.com/feature/5629709824032768 for more details.',
    /**
    *@description Message in Network Manager
    *@example {XHR} PH1
    *@example {GET} PH2
    *@example {https://example.com} PH3
    */
    sFailedLoadingSS: '{PH1} failed loading: {PH2} "{PH3}".',
    /**
    *@description Message in Network Manager
    *@example {XHR} PH1
    *@example {GET} PH2
    *@example {https://example.com} PH3
    */
    sFinishedLoadingSS: '{PH1} finished loading: {PH2} "{PH3}".',
};
const str_ = i18n.i18n.registerUIStrings('core/sdk/NetworkManager.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
const requestToManagerMap = new WeakMap();
const CONNECTION_TYPES = new Map([
    ['2g', "cellular2g" /* Cellular2g */],
    ['3g', "cellular3g" /* Cellular3g */],
    ['4g', "cellular4g" /* Cellular4g */],
    ['bluetooth', "bluetooth" /* Bluetooth */],
    ['wifi', "wifi" /* Wifi */],
    ['wimax', "wimax" /* Wimax */],
]);
export class NetworkManager extends SDKModel {
    dispatcher;
    fetchDispatcher;
    #networkAgent;
    #bypassServiceWorkerSetting;
    constructor(target) {
        super(target);
        this.dispatcher = new NetworkDispatcher(this);
        this.fetchDispatcher = new FetchDispatcher(target.fetchAgent());
        this.#networkAgent = target.networkAgent();
        target.registerNetworkDispatcher(this.dispatcher);
        target.registerFetchDispatcher(this.fetchDispatcher);
        if (Common.Settings.Settings.instance().moduleSetting('cacheDisabled').get()) {
            void this.#networkAgent.invoke_setCacheDisabled({ cacheDisabled: true });
        }
        void this.#networkAgent.invoke_enable({ maxPostDataSize: MAX_EAGER_POST_REQUEST_BODY_LENGTH });
        void this.#networkAgent.invoke_setAttachDebugStack({ enabled: true });
        this.#bypassServiceWorkerSetting = Common.Settings.Settings.instance().createSetting('bypassServiceWorker', false);
        if (this.#bypassServiceWorkerSetting.get()) {
            this.bypassServiceWorkerChanged();
        }
        this.#bypassServiceWorkerSetting.addChangeListener(this.bypassServiceWorkerChanged, this);
        Common.Settings.Settings.instance()
            .moduleSetting('cacheDisabled')
            .addChangeListener(this.cacheDisabledSettingChanged, this);
    }
    static forRequest(request) {
        return requestToManagerMap.get(request) || null;
    }
    static canReplayRequest(request) {
        return Boolean(requestToManagerMap.get(request)) && Boolean(request.backendRequestId()) && !request.isRedirect() &&
            request.resourceType() === Common.ResourceType.resourceTypes.XHR;
    }
    static replayRequest(request) {
        const manager = requestToManagerMap.get(request);
        const requestId = request.backendRequestId();
        if (!manager || !requestId || request.isRedirect()) {
            return;
        }
        void manager.#networkAgent.invoke_replayXHR({ requestId });
    }
    static async searchInRequest(request, query, caseSensitive, isRegex) {
        const manager = NetworkManager.forRequest(request);
        const requestId = request.backendRequestId();
        if (!manager || !requestId || request.isRedirect()) {
            return [];
        }
        const response = await manager.#networkAgent.invoke_searchInResponseBody({ requestId, query: query, caseSensitive: caseSensitive, isRegex: isRegex });
        return response.result || [];
    }
    static async requestContentData(request) {
        if (request.resourceType() === Common.ResourceType.resourceTypes.WebSocket) {
            return { error: i18nString(UIStrings.noContentForWebSocket), content: null, encoded: false };
        }
        if (!request.finished) {
            await request.once(NetworkRequestEvents.FinishedLoading);
        }
        if (request.isRedirect()) {
            return { error: i18nString(UIStrings.noContentForRedirect), content: null, encoded: false };
        }
        if (request.isPreflightRequest()) {
            return { error: i18nString(UIStrings.noContentForPreflight), content: null, encoded: false };
        }
        const manager = NetworkManager.forRequest(request);
        if (!manager) {
            return { error: 'No network manager for request', content: null, encoded: false };
        }
        const requestId = request.backendRequestId();
        if (!requestId) {
            return { error: 'No backend request id for request', content: null, encoded: false };
        }
        const response = await manager.#networkAgent.invoke_getResponseBody({ requestId });
        const error = response.getError() || null;
        return { error: error, content: error ? null : response.body, encoded: response.base64Encoded };
    }
    static async requestPostData(request) {
        const manager = NetworkManager.forRequest(request);
        if (!manager) {
            console.error('No network manager for request');
            return null;
        }
        const requestId = request.backendRequestId();
        if (!requestId) {
            console.error('No backend request id for request');
            return null;
        }
        try {
            const { postData } = await manager.#networkAgent.invoke_getRequestPostData({ requestId });
            return postData;
        }
        catch (e) {
            return e.message;
        }
    }
    static connectionType(conditions) {
        if (!conditions.download && !conditions.upload) {
            return "none" /* None */;
        }
        const title = typeof conditions.title === 'function' ? conditions.title().toLowerCase() : conditions.title.toLowerCase();
        for (const [name, protocolType] of CONNECTION_TYPES) {
            if (title.includes(name)) {
                return protocolType;
            }
        }
        return "other" /* Other */;
    }
    static lowercaseHeaders(headers) {
        const newHeaders = {};
        for (const headerName in headers) {
            newHeaders[headerName.toLowerCase()] = headers[headerName];
        }
        return newHeaders;
    }
    requestForURL(url) {
        return this.dispatcher.requestForURL(url);
    }
    requestforId(id) {
        return this.dispatcher.requestForId(id);
    }
    cacheDisabledSettingChanged({ data: enabled }) {
        void this.#networkAgent.invoke_setCacheDisabled({ cacheDisabled: enabled });
    }
    dispose() {
        Common.Settings.Settings.instance()
            .moduleSetting('cacheDisabled')
            .removeChangeListener(this.cacheDisabledSettingChanged, this);
    }
    bypassServiceWorkerChanged() {
        void this.#networkAgent.invoke_setBypassServiceWorker({ bypass: this.#bypassServiceWorkerSetting.get() });
    }
    async getSecurityIsolationStatus(frameId) {
        const result = await this.#networkAgent.invoke_getSecurityIsolationStatus({ frameId: frameId ?? undefined });
        if (result.getError()) {
            return null;
        }
        return result.status;
    }
    async enableReportingApi(enable = true) {
        return this.#networkAgent.invoke_enableReportingApi({ enable });
    }
    async loadNetworkResource(frameId, url, options) {
        const result = await this.#networkAgent.invoke_loadNetworkResource({ frameId: frameId ?? undefined, url, options });
        if (result.getError()) {
            throw new Error(result.getError());
        }
        return result.resource;
    }
    clearRequests() {
        this.dispatcher.clearRequests();
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["RequestStarted"] = "RequestStarted";
    Events["RequestUpdated"] = "RequestUpdated";
    Events["RequestFinished"] = "RequestFinished";
    Events["RequestUpdateDropped"] = "RequestUpdateDropped";
    Events["ResponseReceived"] = "ResponseReceived";
    Events["MessageGenerated"] = "MessageGenerated";
    Events["RequestRedirected"] = "RequestRedirected";
    Events["LoadingFinished"] = "LoadingFinished";
    Events["ReportingApiReportAdded"] = "ReportingApiReportAdded";
    Events["ReportingApiReportUpdated"] = "ReportingApiReportUpdated";
    Events["ReportingApiEndpointsChangedForOrigin"] = "ReportingApiEndpointsChangedForOrigin";
})(Events || (Events = {}));
export const NoThrottlingConditions = {
    title: i18nLazyString(UIStrings.noThrottling),
    i18nTitleKey: UIStrings.noThrottling,
    download: -1,
    upload: -1,
    latency: 0,
};
export const OfflineConditions = {
    title: i18nLazyString(UIStrings.offline),
    i18nTitleKey: UIStrings.offline,
    download: 0,
    upload: 0,
    latency: 0,
};
export const Slow3GConditions = {
    title: i18nLazyString(UIStrings.slowG),
    i18nTitleKey: UIStrings.slowG,
    download: 500 * 1000 / 8 * .8,
    upload: 500 * 1000 / 8 * .8,
    latency: 400 * 5,
};
export const Fast3GConditions = {
    title: i18nLazyString(UIStrings.fastG),
    i18nTitleKey: UIStrings.fastG,
    download: 1.6 * 1000 * 1000 / 8 * .9,
    upload: 750 * 1000 / 8 * .9,
    latency: 150 * 3.75,
};
const MAX_EAGER_POST_REQUEST_BODY_LENGTH = 64 * 1024; // bytes
export class FetchDispatcher {
    #fetchAgent;
    constructor(agent) {
        this.#fetchAgent = agent;
    }
    requestPaused({ requestId, request, resourceType, responseStatusCode, responseHeaders }) {
        void MultitargetNetworkManager.instance().requestIntercepted(new InterceptedRequest(this.#fetchAgent, request, resourceType, requestId, responseStatusCode, responseHeaders));
    }
    authRequired({}) {
    }
}
export class NetworkDispatcher {
    #manager;
    #requestsById;
    #requestsByURL;
    #requestIdToExtraInfoBuilder;
    #requestIdToTrustTokenEvent;
    constructor(manager) {
        this.#manager = manager;
        this.#requestsById = new Map();
        this.#requestsByURL = new Map();
        this.#requestIdToExtraInfoBuilder = new Map();
        /**
         * In case of an early abort or a cache hit, the Trust Token done event is
         * reported before the request itself is created in `requestWillBeSent`.
         * This causes the event to be lost as no `NetworkRequest` instance has been
         * created yet.
         * This map caches the events temporarliy and populates the NetworKRequest
         * once it is created in `requestWillBeSent`.
         */
        this.#requestIdToTrustTokenEvent = new Map();
        MultitargetNetworkManager.instance().addEventListener(MultitargetNetworkManager.Events.RequestIntercepted, this.#markAsIntercepted.bind(this));
    }
    #markAsIntercepted(event) {
        const request = this.requestForURL(event.data);
        if (request) {
            request.setWasIntercepted(true);
        }
    }
    headersMapToHeadersArray(headersMap) {
        const result = [];
        for (const name in headersMap) {
            const values = headersMap[name].split('\n');
            for (let i = 0; i < values.length; ++i) {
                result.push({ name: name, value: values[i] });
            }
        }
        return result;
    }
    updateNetworkRequestWithRequest(networkRequest, request) {
        networkRequest.requestMethod = request.method;
        networkRequest.setRequestHeaders(this.headersMapToHeadersArray(request.headers));
        networkRequest.setRequestFormData(Boolean(request.hasPostData), request.postData || null);
        networkRequest.setInitialPriority(request.initialPriority);
        networkRequest.mixedContentType = request.mixedContentType || "none" /* None */;
        networkRequest.setReferrerPolicy(request.referrerPolicy);
        networkRequest.setIsSameSite(request.isSameSite || false);
    }
    updateNetworkRequestWithResponse(networkRequest, response) {
        if (response.url && networkRequest.url() !== response.url) {
            networkRequest.setUrl(response.url);
        }
        networkRequest.mimeType = response.mimeType;
        if (!networkRequest.statusCode) {
            networkRequest.statusCode = response.status;
        }
        if (!networkRequest.statusText) {
            networkRequest.statusText = response.statusText;
        }
        if (!networkRequest.hasExtraResponseInfo() || networkRequest.wasIntercepted()) {
            networkRequest.responseHeaders = this.headersMapToHeadersArray(response.headers);
        }
        if (response.encodedDataLength >= 0) {
            networkRequest.setTransferSize(response.encodedDataLength);
        }
        if (response.requestHeaders && !networkRequest.hasExtraRequestInfo()) {
            // TODO(http://crbug.com/1004979): Stop using response.requestHeaders and
            //   response.requestHeadersText once shared workers
            //   emit Network.*ExtraInfo events for their network #requests.
            networkRequest.setRequestHeaders(this.headersMapToHeadersArray(response.requestHeaders));
            networkRequest.setRequestHeadersText(response.requestHeadersText || '');
        }
        networkRequest.connectionReused = response.connectionReused;
        networkRequest.connectionId = String(response.connectionId);
        if (response.remoteIPAddress) {
            networkRequest.setRemoteAddress(response.remoteIPAddress, response.remotePort || -1);
        }
        if (response.fromServiceWorker) {
            networkRequest.fetchedViaServiceWorker = true;
        }
        if (response.fromDiskCache) {
            networkRequest.setFromDiskCache();
        }
        if (response.fromPrefetchCache) {
            networkRequest.setFromPrefetchCache();
        }
        if (response.cacheStorageCacheName) {
            networkRequest.setResponseCacheStorageCacheName(response.cacheStorageCacheName);
        }
        if (response.responseTime) {
            networkRequest.setResponseRetrievalTime(new Date(response.responseTime));
        }
        networkRequest.timing = response.timing;
        networkRequest.protocol = response.protocol || '';
        if (response.serviceWorkerResponseSource) {
            networkRequest.setServiceWorkerResponseSource(response.serviceWorkerResponseSource);
        }
        networkRequest.setSecurityState(response.securityState);
        if (response.securityDetails) {
            networkRequest.setSecurityDetails(response.securityDetails);
        }
        const newResourceType = Common.ResourceType.ResourceType.fromMimeTypeOverride(networkRequest.mimeType);
        if (newResourceType) {
            networkRequest.setResourceType(newResourceType);
        }
    }
    requestForId(id) {
        return this.#requestsById.get(id) || null;
    }
    requestForURL(url) {
        return this.#requestsByURL.get(url) || null;
    }
    resourceChangedPriority({ requestId, newPriority }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (networkRequest) {
            networkRequest.setPriority(newPriority);
        }
    }
    signedExchangeReceived({ requestId, info }) {
        // While loading a signed exchange, a signedExchangeReceived event is sent
        // between two requestWillBeSent events.
        // 1. The first requestWillBeSent is sent while starting the navigation (or
        //    prefetching).
        // 2. This signedExchangeReceived event is sent when the browser detects the
        //    signed exchange.
        // 3. The second requestWillBeSent is sent with the generated redirect
        //    response and a new redirected request which URL is the inner request
        //    URL of the signed exchange.
        let networkRequest = this.#requestsById.get(requestId);
        // |requestId| is available only for navigation #requests. If the request was
        // sent from a renderer process for prefetching, it is not available. In the
        // case, need to fallback to look for the URL.
        // TODO(crbug/841076): Sends the request ID of prefetching to the browser
        // process and DevTools to find the matching request.
        if (!networkRequest) {
            networkRequest = this.#requestsByURL.get(info.outerResponse.url);
            if (!networkRequest) {
                return;
            }
        }
        networkRequest.setSignedExchangeInfo(info);
        networkRequest.setResourceType(Common.ResourceType.resourceTypes.SignedExchange);
        this.updateNetworkRequestWithResponse(networkRequest, info.outerResponse);
        this.updateNetworkRequest(networkRequest);
        this.#manager.dispatchEventToListeners(Events.ResponseReceived, { request: networkRequest, response: info.outerResponse });
    }
    requestWillBeSent({ requestId, loaderId, documentURL, request, timestamp, wallTime, initiator, redirectResponse, type, frameId }) {
        let networkRequest = this.#requestsById.get(requestId);
        if (networkRequest) {
            // FIXME: move this check to the backend.
            if (!redirectResponse) {
                return;
            }
            // If signedExchangeReceived event has already been sent for the request,
            // ignores the internally generated |redirectResponse|. The
            // |outerResponse| of SignedExchangeInfo was set to |networkRequest| in
            // signedExchangeReceived().
            if (!networkRequest.signedExchangeInfo()) {
                this.responseReceived({
                    requestId,
                    loaderId,
                    timestamp,
                    type: type || "Other" /* Other */,
                    response: redirectResponse,
                    hasExtraInfo: false,
                    frameId,
                });
            }
            networkRequest = this.appendRedirect(requestId, timestamp, request.url);
            this.#manager.dispatchEventToListeners(Events.RequestRedirected, networkRequest);
        }
        else {
            networkRequest = NetworkRequest.create(requestId, request.url, documentURL, frameId ?? null, loaderId, initiator);
            requestToManagerMap.set(networkRequest, this.#manager);
        }
        networkRequest.hasNetworkData = true;
        this.updateNetworkRequestWithRequest(networkRequest, request);
        networkRequest.setIssueTime(timestamp, wallTime);
        networkRequest.setResourceType(type ? Common.ResourceType.resourceTypes[type] : Common.ResourceType.resourceTypes.Other);
        if (request.trustTokenParams) {
            networkRequest.setTrustTokenParams(request.trustTokenParams);
        }
        const maybeTrustTokenEvent = this.#requestIdToTrustTokenEvent.get(requestId);
        if (maybeTrustTokenEvent) {
            networkRequest.setTrustTokenOperationDoneEvent(maybeTrustTokenEvent);
            this.#requestIdToTrustTokenEvent.delete(requestId);
        }
        this.getExtraInfoBuilder(requestId).addRequest(networkRequest);
        this.startNetworkRequest(networkRequest, request);
    }
    requestServedFromCache({ requestId }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            return;
        }
        networkRequest.setFromMemoryCache();
    }
    responseReceived({ requestId, loaderId, timestamp, type, response, frameId }) {
        const networkRequest = this.#requestsById.get(requestId);
        const lowercaseHeaders = NetworkManager.lowercaseHeaders(response.headers);
        if (!networkRequest) {
            const lastModifiedHeader = lowercaseHeaders['last-modified'];
            // We missed the requestWillBeSent.
            const eventData = {
                url: response.url,
                frameId: frameId ?? null,
                loaderId: loaderId,
                resourceType: type,
                mimeType: response.mimeType,
                lastModified: lastModifiedHeader ? new Date(lastModifiedHeader) : null,
            };
            this.#manager.dispatchEventToListeners(Events.RequestUpdateDropped, eventData);
            return;
        }
        networkRequest.responseReceivedTime = timestamp;
        networkRequest.setResourceType(Common.ResourceType.resourceTypes[type]);
        this.updateNetworkRequestWithResponse(networkRequest, response);
        this.updateNetworkRequest(networkRequest);
        this.#manager.dispatchEventToListeners(Events.ResponseReceived, { request: networkRequest, response });
    }
    dataReceived({ requestId, timestamp, dataLength, encodedDataLength }) {
        let networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            networkRequest = this.maybeAdoptMainResourceRequest(requestId);
        }
        if (!networkRequest) {
            return;
        }
        networkRequest.resourceSize += dataLength;
        if (encodedDataLength !== -1) {
            networkRequest.increaseTransferSize(encodedDataLength);
        }
        networkRequest.endTime = timestamp;
        this.updateNetworkRequest(networkRequest);
    }
    loadingFinished({ requestId, timestamp: finishTime, encodedDataLength, shouldReportCorbBlocking }) {
        let networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            networkRequest = this.maybeAdoptMainResourceRequest(requestId);
        }
        if (!networkRequest) {
            return;
        }
        this.getExtraInfoBuilder(requestId).finished();
        this.finishNetworkRequest(networkRequest, finishTime, encodedDataLength, shouldReportCorbBlocking);
        this.#manager.dispatchEventToListeners(Events.LoadingFinished, networkRequest);
    }
    loadingFailed({ requestId, timestamp: time, type: resourceType, errorText: localizedDescription, canceled, blockedReason, corsErrorStatus, }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            return;
        }
        networkRequest.failed = true;
        networkRequest.setResourceType(Common.ResourceType.resourceTypes[resourceType]);
        networkRequest.canceled = Boolean(canceled);
        if (blockedReason) {
            networkRequest.setBlockedReason(blockedReason);
            if (blockedReason === "inspector" /* Inspector */) {
                const message = i18nString(UIStrings.requestWasBlockedByDevtoolsS, { PH1: networkRequest.url() });
                this.#manager.dispatchEventToListeners(Events.MessageGenerated, { message: message, requestId: requestId, warning: true });
            }
        }
        if (corsErrorStatus) {
            networkRequest.setCorsErrorStatus(corsErrorStatus);
        }
        networkRequest.localizedFailDescription = localizedDescription;
        this.getExtraInfoBuilder(requestId).finished();
        this.finishNetworkRequest(networkRequest, time, -1);
    }
    webSocketCreated({ requestId, url: requestURL, initiator }) {
        const networkRequest = NetworkRequest.createForWebSocket(requestId, requestURL, initiator);
        requestToManagerMap.set(networkRequest, this.#manager);
        networkRequest.setResourceType(Common.ResourceType.resourceTypes.WebSocket);
        this.startNetworkRequest(networkRequest, null);
    }
    webSocketWillSendHandshakeRequest({ requestId, timestamp: time, wallTime, request }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            return;
        }
        networkRequest.requestMethod = 'GET';
        networkRequest.setRequestHeaders(this.headersMapToHeadersArray(request.headers));
        networkRequest.setIssueTime(time, wallTime);
        this.updateNetworkRequest(networkRequest);
    }
    webSocketHandshakeResponseReceived({ requestId, timestamp: time, response }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            return;
        }
        networkRequest.statusCode = response.status;
        networkRequest.statusText = response.statusText;
        networkRequest.responseHeaders = this.headersMapToHeadersArray(response.headers);
        networkRequest.responseHeadersText = response.headersText || '';
        if (response.requestHeaders) {
            networkRequest.setRequestHeaders(this.headersMapToHeadersArray(response.requestHeaders));
        }
        if (response.requestHeadersText) {
            networkRequest.setRequestHeadersText(response.requestHeadersText);
        }
        networkRequest.responseReceivedTime = time;
        networkRequest.protocol = 'websocket';
        this.updateNetworkRequest(networkRequest);
    }
    webSocketFrameReceived({ requestId, timestamp: time, response }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            return;
        }
        networkRequest.addProtocolFrame(response, time, false);
        networkRequest.responseReceivedTime = time;
        this.updateNetworkRequest(networkRequest);
    }
    webSocketFrameSent({ requestId, timestamp: time, response }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            return;
        }
        networkRequest.addProtocolFrame(response, time, true);
        networkRequest.responseReceivedTime = time;
        this.updateNetworkRequest(networkRequest);
    }
    webSocketFrameError({ requestId, timestamp: time, errorMessage }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            return;
        }
        networkRequest.addProtocolFrameError(errorMessage, time);
        networkRequest.responseReceivedTime = time;
        this.updateNetworkRequest(networkRequest);
    }
    webSocketClosed({ requestId, timestamp: time }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            return;
        }
        this.finishNetworkRequest(networkRequest, time, -1);
    }
    eventSourceMessageReceived({ requestId, timestamp: time, eventName, eventId, data }) {
        const networkRequest = this.#requestsById.get(requestId);
        if (!networkRequest) {
            return;
        }
        networkRequest.addEventSourceMessage(time, eventName, eventId, data);
    }
    requestIntercepted({}) {
    }
    requestWillBeSentExtraInfo({ requestId, associatedCookies, headers, clientSecurityState, connectTiming }) {
        const blockedRequestCookies = [];
        const includedRequestCookies = [];
        for (const { blockedReasons, cookie } of associatedCookies) {
            if (blockedReasons.length === 0) {
                includedRequestCookies.push(Cookie.fromProtocolCookie(cookie));
            }
            else {
                blockedRequestCookies.push({ blockedReasons, cookie: Cookie.fromProtocolCookie(cookie) });
            }
        }
        const extraRequestInfo = {
            blockedRequestCookies,
            includedRequestCookies,
            requestHeaders: this.headersMapToHeadersArray(headers),
            clientSecurityState: clientSecurityState,
            connectTiming,
        };
        this.getExtraInfoBuilder(requestId).addRequestExtraInfo(extraRequestInfo);
    }
    responseReceivedExtraInfo({ requestId, blockedCookies, headers, headersText, resourceIPAddressSpace, statusCode }) {
        const extraResponseInfo = {
            blockedResponseCookies: blockedCookies.map(blockedCookie => {
                return {
                    blockedReasons: blockedCookie.blockedReasons,
                    cookieLine: blockedCookie.cookieLine,
                    cookie: blockedCookie.cookie ? Cookie.fromProtocolCookie(blockedCookie.cookie) : null,
                };
            }),
            responseHeaders: this.headersMapToHeadersArray(headers),
            responseHeadersText: headersText,
            resourceIPAddressSpace,
            statusCode,
        };
        this.getExtraInfoBuilder(requestId).addResponseExtraInfo(extraResponseInfo);
    }
    getExtraInfoBuilder(requestId) {
        let builder;
        if (!this.#requestIdToExtraInfoBuilder.has(requestId)) {
            builder = new ExtraInfoBuilder();
            this.#requestIdToExtraInfoBuilder.set(requestId, builder);
        }
        else {
            builder = this.#requestIdToExtraInfoBuilder.get(requestId);
        }
        return builder;
    }
    appendRedirect(requestId, time, redirectURL) {
        const originalNetworkRequest = this.#requestsById.get(requestId);
        if (!originalNetworkRequest) {
            throw new Error(`Could not find original network request for ${requestId}`);
        }
        let redirectCount = 0;
        for (let redirect = originalNetworkRequest.redirectSource(); redirect; redirect = redirect.redirectSource()) {
            redirectCount++;
        }
        originalNetworkRequest.markAsRedirect(redirectCount);
        this.finishNetworkRequest(originalNetworkRequest, time, -1);
        const newNetworkRequest = NetworkRequest.create(requestId, redirectURL, originalNetworkRequest.documentURL, originalNetworkRequest.frameId, originalNetworkRequest.loaderId, originalNetworkRequest.initiator());
        requestToManagerMap.set(newNetworkRequest, this.#manager);
        newNetworkRequest.setRedirectSource(originalNetworkRequest);
        originalNetworkRequest.setRedirectDestination(newNetworkRequest);
        return newNetworkRequest;
    }
    maybeAdoptMainResourceRequest(requestId) {
        const request = MultitargetNetworkManager.instance().inflightMainResourceRequests.get(requestId);
        if (!request) {
            return null;
        }
        const oldDispatcher = NetworkManager.forRequest(request).dispatcher;
        oldDispatcher.#requestsById.delete(requestId);
        oldDispatcher.#requestsByURL.delete(request.url());
        this.#requestsById.set(requestId, request);
        this.#requestsByURL.set(request.url(), request);
        requestToManagerMap.set(request, this.#manager);
        return request;
    }
    startNetworkRequest(networkRequest, originalRequest) {
        this.#requestsById.set(networkRequest.requestId(), networkRequest);
        this.#requestsByURL.set(networkRequest.url(), networkRequest);
        // The following relies on the fact that loaderIds and requestIds are
        // globally unique and that the main request has them equal.
        if (networkRequest.loaderId === networkRequest.requestId()) {
            MultitargetNetworkManager.instance().inflightMainResourceRequests.set(networkRequest.requestId(), networkRequest);
        }
        this.#manager.dispatchEventToListeners(Events.RequestStarted, { request: networkRequest, originalRequest });
    }
    updateNetworkRequest(networkRequest) {
        this.#manager.dispatchEventToListeners(Events.RequestUpdated, networkRequest);
    }
    finishNetworkRequest(networkRequest, finishTime, encodedDataLength, shouldReportCorbBlocking) {
        networkRequest.endTime = finishTime;
        networkRequest.finished = true;
        if (encodedDataLength >= 0) {
            const redirectSource = networkRequest.redirectSource();
            if (redirectSource && redirectSource.signedExchangeInfo()) {
                networkRequest.setTransferSize(0);
                redirectSource.setTransferSize(encodedDataLength);
                this.updateNetworkRequest(redirectSource);
            }
            else {
                networkRequest.setTransferSize(encodedDataLength);
            }
        }
        this.#manager.dispatchEventToListeners(Events.RequestFinished, networkRequest);
        MultitargetNetworkManager.instance().inflightMainResourceRequests.delete(networkRequest.requestId());
        if (shouldReportCorbBlocking) {
            const message = i18nString(UIStrings.crossoriginReadBlockingCorb, { PH1: networkRequest.url(), PH2: networkRequest.mimeType });
            this.#manager.dispatchEventToListeners(Events.MessageGenerated, { message: message, requestId: networkRequest.requestId(), warning: true });
        }
        if (Common.Settings.Settings.instance().moduleSetting('monitoringXHREnabled').get() &&
            networkRequest.resourceType().category() === Common.ResourceType.resourceCategories.XHR) {
            let message;
            const failedToLoad = networkRequest.failed || networkRequest.hasErrorStatusCode();
            if (failedToLoad) {
                message = i18nString(UIStrings.sFailedLoadingSS, { PH1: networkRequest.resourceType().title(), PH2: networkRequest.requestMethod, PH3: networkRequest.url() });
            }
            else {
                message = i18nString(UIStrings.sFinishedLoadingSS, { PH1: networkRequest.resourceType().title(), PH2: networkRequest.requestMethod, PH3: networkRequest.url() });
            }
            this.#manager.dispatchEventToListeners(Events.MessageGenerated, { message: message, requestId: networkRequest.requestId(), warning: false });
        }
    }
    clearRequests() {
        this.#requestsById.clear();
        this.#requestsByURL.clear();
        this.#requestIdToExtraInfoBuilder.clear();
    }
    webTransportCreated({ transportId, url: requestURL, timestamp: time, initiator }) {
        const networkRequest = NetworkRequest.createForWebSocket(transportId, requestURL, initiator);
        networkRequest.hasNetworkData = true;
        requestToManagerMap.set(networkRequest, this.#manager);
        networkRequest.setResourceType(Common.ResourceType.resourceTypes.WebTransport);
        networkRequest.setIssueTime(time, 0);
        // TODO(yoichio): Add appropreate events to address abort cases.
        this.startNetworkRequest(networkRequest, null);
    }
    webTransportConnectionEstablished({ transportId, timestamp: time }) {
        const networkRequest = this.#requestsById.get(transportId);
        if (!networkRequest) {
            return;
        }
        // This dummy deltas are needed to show this request as being
        // downloaded(blue) given typical WebTransport is kept for a while.
        // TODO(yoichio): Add appropreate events to fix these dummy datas.
        // DNS lookup?
        networkRequest.responseReceivedTime = time;
        networkRequest.endTime = time + 0.001;
        this.updateNetworkRequest(networkRequest);
    }
    webTransportClosed({ transportId, timestamp: time }) {
        const networkRequest = this.#requestsById.get(transportId);
        if (!networkRequest) {
            return;
        }
        networkRequest.endTime = time;
        this.finishNetworkRequest(networkRequest, time, 0);
    }
    trustTokenOperationDone(event) {
        const request = this.#requestsById.get(event.requestId);
        if (!request) {
            this.#requestIdToTrustTokenEvent.set(event.requestId, event);
            return;
        }
        request.setTrustTokenOperationDoneEvent(event);
    }
    subresourceWebBundleMetadataReceived({ requestId, urls }) {
        const extraInfoBuilder = this.getExtraInfoBuilder(requestId);
        extraInfoBuilder.setWebBundleInfo({ resourceUrls: urls });
        const finalRequest = extraInfoBuilder.finalRequest();
        if (finalRequest) {
            this.updateNetworkRequest(finalRequest);
        }
    }
    subresourceWebBundleMetadataError({ requestId, errorMessage }) {
        const extraInfoBuilder = this.getExtraInfoBuilder(requestId);
        extraInfoBuilder.setWebBundleInfo({ errorMessage });
        const finalRequest = extraInfoBuilder.finalRequest();
        if (finalRequest) {
            this.updateNetworkRequest(finalRequest);
        }
    }
    subresourceWebBundleInnerResponseParsed({ innerRequestId, bundleRequestId }) {
        const extraInfoBuilder = this.getExtraInfoBuilder(innerRequestId);
        extraInfoBuilder.setWebBundleInnerRequestInfo({ bundleRequestId });
        const finalRequest = extraInfoBuilder.finalRequest();
        if (finalRequest) {
            this.updateNetworkRequest(finalRequest);
        }
    }
    subresourceWebBundleInnerResponseError({ innerRequestId, errorMessage }) {
        const extraInfoBuilder = this.getExtraInfoBuilder(innerRequestId);
        extraInfoBuilder.setWebBundleInnerRequestInfo({ errorMessage });
        const finalRequest = extraInfoBuilder.finalRequest();
        if (finalRequest) {
            this.updateNetworkRequest(finalRequest);
        }
    }
    reportingApiReportAdded(data) {
        this.#manager.dispatchEventToListeners(Events.ReportingApiReportAdded, data.report);
    }
    reportingApiReportUpdated(data) {
        this.#manager.dispatchEventToListeners(Events.ReportingApiReportUpdated, data.report);
    }
    reportingApiEndpointsChangedForOrigin(data) {
        this.#manager.dispatchEventToListeners(Events.ReportingApiEndpointsChangedForOrigin, data);
    }
    /**
     * @deprecated
     * This method is only kept for usage in a web test.
     */
    createNetworkRequest(requestId, frameId, loaderId, url, documentURL, initiator) {
        const request = NetworkRequest.create(requestId, url, documentURL, frameId, loaderId, initiator);
        requestToManagerMap.set(request, this.#manager);
        return request;
    }
}
let multiTargetNetworkManagerInstance;
export class MultitargetNetworkManager extends Common.ObjectWrapper.ObjectWrapper {
    #userAgentOverrideInternal;
    #userAgentMetadataOverride;
    #customAcceptedEncodings;
    #networkAgents;
    #fetchAgents;
    inflightMainResourceRequests;
    #networkConditionsInternal;
    #updatingInterceptionPatternsPromise;
    #blockingEnabledSetting;
    #blockedPatternsSetting;
    #effectiveBlockedURLs;
    #urlsForRequestInterceptor;
    #extraHeaders;
    #customUserAgent;
    constructor() {
        super();
        this.#userAgentOverrideInternal = '';
        this.#userAgentMetadataOverride = null;
        this.#customAcceptedEncodings = null;
        this.#networkAgents = new Set();
        this.#fetchAgents = new Set();
        this.inflightMainResourceRequests = new Map();
        this.#networkConditionsInternal = NoThrottlingConditions;
        this.#updatingInterceptionPatternsPromise = null;
        // TODO(allada) Remove these and merge it with request interception.
        this.#blockingEnabledSetting = Common.Settings.Settings.instance().moduleSetting('requestBlockingEnabled');
        this.#blockedPatternsSetting = Common.Settings.Settings.instance().createSetting('networkBlockedPatterns', []);
        this.#effectiveBlockedURLs = [];
        this.updateBlockedPatterns();
        this.#urlsForRequestInterceptor = new Platform.MapUtilities.Multimap();
        TargetManager.instance().observeModels(NetworkManager, this);
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!multiTargetNetworkManagerInstance || forceNew) {
            multiTargetNetworkManagerInstance = new MultitargetNetworkManager();
        }
        return multiTargetNetworkManagerInstance;
    }
    static getChromeVersion() {
        const chromeRegex = /(?:^|\W)(?:Chrome|HeadlessChrome)\/(\S+)/;
        const chromeMatch = navigator.userAgent.match(chromeRegex);
        if (chromeMatch && chromeMatch.length > 1) {
            return chromeMatch[1];
        }
        return '';
    }
    static patchUserAgentWithChromeVersion(uaString) {
        // Patches Chrome/ChrOS version from user #agent ("1.2.3.4" when user #agent is: "Chrome/1.2.3.4").
        // Otherwise, ignore it. This assumes additional appVersions appear after the Chrome version.
        const chromeVersion = MultitargetNetworkManager.getChromeVersion();
        if (chromeVersion.length > 0) {
            // "1.2.3.4" becomes "1.0.100.0"
            const additionalAppVersion = chromeVersion.split('.', 1)[0] + '.0.100.0';
            return Platform.StringUtilities.sprintf(uaString, chromeVersion, additionalAppVersion);
        }
        return uaString;
    }
    static patchUserAgentMetadataWithChromeVersion(userAgentMetadata) {
        // Patches Chrome/ChrOS version from user #agent metadata ("1.2.3.4" when user #agent is: "Chrome/1.2.3.4").
        // Otherwise, ignore it. This assumes additional appVersions appear after the Chrome version.
        if (!userAgentMetadata.brands) {
            return;
        }
        const chromeVersion = MultitargetNetworkManager.getChromeVersion();
        if (chromeVersion.length === 0) {
            return;
        }
        const majorVersion = chromeVersion.split('.', 1)[0];
        for (const brand of userAgentMetadata.brands) {
            if (brand.version.includes('%s')) {
                brand.version = Platform.StringUtilities.sprintf(brand.version, majorVersion);
            }
        }
        if (userAgentMetadata.fullVersion) {
            if (userAgentMetadata.fullVersion.includes('%s')) {
                userAgentMetadata.fullVersion = Platform.StringUtilities.sprintf(userAgentMetadata.fullVersion, chromeVersion);
            }
        }
    }
    modelAdded(networkManager) {
        const networkAgent = networkManager.target().networkAgent();
        const fetchAgent = networkManager.target().fetchAgent();
        if (this.#extraHeaders) {
            void networkAgent.invoke_setExtraHTTPHeaders({ headers: this.#extraHeaders });
        }
        if (this.currentUserAgent()) {
            void networkAgent.invoke_setUserAgentOverride({ userAgent: this.currentUserAgent(), userAgentMetadata: this.#userAgentMetadataOverride || undefined });
        }
        if (this.#effectiveBlockedURLs.length) {
            void networkAgent.invoke_setBlockedURLs({ urls: this.#effectiveBlockedURLs });
        }
        if (this.isIntercepting()) {
            void fetchAgent.invoke_enable({ patterns: this.#urlsForRequestInterceptor.valuesArray() });
        }
        if (this.#customAcceptedEncodings === null) {
            void networkAgent.invoke_clearAcceptedEncodingsOverride();
        }
        else {
            void networkAgent.invoke_setAcceptedEncodings({ encodings: this.#customAcceptedEncodings });
        }
        this.#networkAgents.add(networkAgent);
        this.#fetchAgents.add(fetchAgent);
        if (this.isThrottling()) {
            this.updateNetworkConditions(networkAgent);
        }
    }
    modelRemoved(networkManager) {
        for (const entry of this.inflightMainResourceRequests) {
            const manager = NetworkManager.forRequest(entry[1]);
            if (manager !== networkManager) {
                continue;
            }
            this.inflightMainResourceRequests.delete(entry[0]);
        }
        this.#networkAgents.delete(networkManager.target().networkAgent());
        this.#fetchAgents.delete(networkManager.target().fetchAgent());
    }
    isThrottling() {
        return this.#networkConditionsInternal.download >= 0 || this.#networkConditionsInternal.upload >= 0 ||
            this.#networkConditionsInternal.latency > 0;
    }
    isOffline() {
        return !this.#networkConditionsInternal.download && !this.#networkConditionsInternal.upload;
    }
    setNetworkConditions(conditions) {
        this.#networkConditionsInternal = conditions;
        for (const agent of this.#networkAgents) {
            this.updateNetworkConditions(agent);
        }
        this.dispatchEventToListeners(MultitargetNetworkManager.Events.ConditionsChanged);
    }
    networkConditions() {
        return this.#networkConditionsInternal;
    }
    updateNetworkConditions(networkAgent) {
        const conditions = this.#networkConditionsInternal;
        if (!this.isThrottling()) {
            void networkAgent.invoke_emulateNetworkConditions({ offline: false, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
        }
        else {
            void networkAgent.invoke_emulateNetworkConditions({
                offline: this.isOffline(),
                latency: conditions.latency,
                downloadThroughput: conditions.download < 0 ? 0 : conditions.download,
                uploadThroughput: conditions.upload < 0 ? 0 : conditions.upload,
                connectionType: NetworkManager.connectionType(conditions),
            });
        }
    }
    setExtraHTTPHeaders(headers) {
        this.#extraHeaders = headers;
        for (const agent of this.#networkAgents) {
            void agent.invoke_setExtraHTTPHeaders({ headers: this.#extraHeaders });
        }
    }
    currentUserAgent() {
        return this.#customUserAgent ? this.#customUserAgent : this.#userAgentOverrideInternal;
    }
    updateUserAgentOverride() {
        const userAgent = this.currentUserAgent();
        for (const agent of this.#networkAgents) {
            void agent.invoke_setUserAgentOverride({ userAgent: userAgent, userAgentMetadata: this.#userAgentMetadataOverride || undefined });
        }
    }
    setUserAgentOverride(userAgent, userAgentMetadataOverride) {
        const uaChanged = (this.#userAgentOverrideInternal !== userAgent);
        this.#userAgentOverrideInternal = userAgent;
        if (!this.#customUserAgent) {
            this.#userAgentMetadataOverride = userAgentMetadataOverride;
            this.updateUserAgentOverride();
        }
        else {
            this.#userAgentMetadataOverride = null;
        }
        if (uaChanged) {
            this.dispatchEventToListeners(MultitargetNetworkManager.Events.UserAgentChanged);
        }
    }
    userAgentOverride() {
        return this.#userAgentOverrideInternal;
    }
    setCustomUserAgentOverride(userAgent, userAgentMetadataOverride = null) {
        this.#customUserAgent = userAgent;
        this.#userAgentMetadataOverride = userAgentMetadataOverride;
        this.updateUserAgentOverride();
    }
    setCustomAcceptedEncodingsOverride(acceptedEncodings) {
        this.#customAcceptedEncodings = acceptedEncodings;
        this.updateAcceptedEncodingsOverride();
        this.dispatchEventToListeners(MultitargetNetworkManager.Events.AcceptedEncodingsChanged);
    }
    clearCustomAcceptedEncodingsOverride() {
        this.#customAcceptedEncodings = null;
        this.updateAcceptedEncodingsOverride();
        this.dispatchEventToListeners(MultitargetNetworkManager.Events.AcceptedEncodingsChanged);
    }
    isAcceptedEncodingOverrideSet() {
        return this.#customAcceptedEncodings !== null;
    }
    updateAcceptedEncodingsOverride() {
        const customAcceptedEncodings = this.#customAcceptedEncodings;
        for (const agent of this.#networkAgents) {
            if (customAcceptedEncodings === null) {
                void agent.invoke_clearAcceptedEncodingsOverride();
            }
            else {
                void agent.invoke_setAcceptedEncodings({ encodings: customAcceptedEncodings });
            }
        }
    }
    // TODO(allada) Move all request blocking into interception and let view manage blocking.
    blockedPatterns() {
        return this.#blockedPatternsSetting.get().slice();
    }
    blockingEnabled() {
        return this.#blockingEnabledSetting.get();
    }
    isBlocking() {
        return Boolean(this.#effectiveBlockedURLs.length);
    }
    setBlockedPatterns(patterns) {
        this.#blockedPatternsSetting.set(patterns);
        this.updateBlockedPatterns();
        this.dispatchEventToListeners(MultitargetNetworkManager.Events.BlockedPatternsChanged);
    }
    setBlockingEnabled(enabled) {
        if (this.#blockingEnabledSetting.get() === enabled) {
            return;
        }
        this.#blockingEnabledSetting.set(enabled);
        this.updateBlockedPatterns();
        this.dispatchEventToListeners(MultitargetNetworkManager.Events.BlockedPatternsChanged);
    }
    updateBlockedPatterns() {
        const urls = [];
        if (this.#blockingEnabledSetting.get()) {
            for (const pattern of this.#blockedPatternsSetting.get()) {
                if (pattern.enabled) {
                    urls.push(pattern.url);
                }
            }
        }
        if (!urls.length && !this.#effectiveBlockedURLs.length) {
            return;
        }
        this.#effectiveBlockedURLs = urls;
        for (const agent of this.#networkAgents) {
            void agent.invoke_setBlockedURLs({ urls: this.#effectiveBlockedURLs });
        }
    }
    isIntercepting() {
        return Boolean(this.#urlsForRequestInterceptor.size);
    }
    setInterceptionHandlerForPatterns(patterns, requestInterceptor) {
        // Note: requestInterceptors may recieve interception #requests for patterns they did not subscribe to.
        this.#urlsForRequestInterceptor.deleteAll(requestInterceptor);
        for (const newPattern of patterns) {
            this.#urlsForRequestInterceptor.set(requestInterceptor, newPattern);
        }
        return this.updateInterceptionPatternsOnNextTick();
    }
    updateInterceptionPatternsOnNextTick() {
        // This is used so we can register and unregister patterns in loops without sending lots of protocol messages.
        if (!this.#updatingInterceptionPatternsPromise) {
            this.#updatingInterceptionPatternsPromise = Promise.resolve().then(this.updateInterceptionPatterns.bind(this));
        }
        return this.#updatingInterceptionPatternsPromise;
    }
    async updateInterceptionPatterns() {
        if (!Common.Settings.Settings.instance().moduleSetting('cacheDisabled').get()) {
            Common.Settings.Settings.instance().moduleSetting('cacheDisabled').set(true);
        }
        this.#updatingInterceptionPatternsPromise = null;
        const promises = [];
        for (const agent of this.#fetchAgents) {
            promises.push(agent.invoke_enable({ patterns: this.#urlsForRequestInterceptor.valuesArray() }));
        }
        this.dispatchEventToListeners(MultitargetNetworkManager.Events.InterceptorsChanged);
        await Promise.all(promises);
    }
    async requestIntercepted(interceptedRequest) {
        for (const requestInterceptor of this.#urlsForRequestInterceptor.keysArray()) {
            await requestInterceptor(interceptedRequest);
            if (interceptedRequest.hasResponded()) {
                this.dispatchEventToListeners(MultitargetNetworkManager.Events.RequestIntercepted, interceptedRequest.request.url);
                return;
            }
        }
        if (!interceptedRequest.hasResponded()) {
            interceptedRequest.continueRequestWithoutChange();
        }
    }
    clearBrowserCache() {
        for (const agent of this.#networkAgents) {
            void agent.invoke_clearBrowserCache();
        }
    }
    clearBrowserCookies() {
        for (const agent of this.#networkAgents) {
            void agent.invoke_clearBrowserCookies();
        }
    }
    async getCertificate(origin) {
        const target = TargetManager.instance().mainTarget();
        if (!target) {
            return [];
        }
        const certificate = await target.networkAgent().invoke_getCertificate({ origin });
        if (!certificate) {
            return [];
        }
        return certificate.tableNames;
    }
    async loadResource(url) {
        const headers = {};
        const currentUserAgent = this.currentUserAgent();
        if (currentUserAgent) {
            headers['User-Agent'] = currentUserAgent;
        }
        if (Common.Settings.Settings.instance().moduleSetting('cacheDisabled').get()) {
            headers['Cache-Control'] = 'no-cache';
        }
        return new Promise(resolve => Host.ResourceLoader.load(url, headers, (success, _responseHeaders, content, errorDescription) => {
            resolve({ success, content, errorDescription });
        }));
    }
}
(function (MultitargetNetworkManager) {
    // TODO(crbug.com/1167717): Make this a const enum again
    // eslint-disable-next-line rulesdir/const_enum
    let Events;
    (function (Events) {
        Events["BlockedPatternsChanged"] = "BlockedPatternsChanged";
        Events["ConditionsChanged"] = "ConditionsChanged";
        Events["UserAgentChanged"] = "UserAgentChanged";
        Events["InterceptorsChanged"] = "InterceptorsChanged";
        Events["AcceptedEncodingsChanged"] = "AcceptedEncodingsChanged";
        Events["RequestIntercepted"] = "RequestIntercepted";
    })(Events = MultitargetNetworkManager.Events || (MultitargetNetworkManager.Events = {}));
})(MultitargetNetworkManager || (MultitargetNetworkManager = {}));
export class InterceptedRequest {
    #fetchAgent;
    #hasRespondedInternal;
    request;
    resourceType;
    responseStatusCode;
    responseHeaders;
    requestId;
    constructor(fetchAgent, request, resourceType, requestId, responseStatusCode, responseHeaders) {
        this.#fetchAgent = fetchAgent;
        this.#hasRespondedInternal = false;
        this.request = request;
        this.resourceType = resourceType;
        this.responseStatusCode = responseStatusCode;
        this.responseHeaders = responseHeaders;
        this.requestId = requestId;
    }
    hasResponded() {
        return this.#hasRespondedInternal;
    }
    async continueRequestWithContent(contentBlob, encoded, responseHeaders) {
        this.#hasRespondedInternal = true;
        const body = encoded ? await contentBlob.text() : await blobToBase64(contentBlob);
        void this.#fetchAgent.invoke_fulfillRequest({ requestId: this.requestId, responseCode: 200, body, responseHeaders });
        async function blobToBase64(blob) {
            const reader = new FileReader();
            const fileContentsLoadedPromise = new Promise(resolve => {
                reader.onloadend = resolve;
            });
            reader.readAsDataURL(blob);
            await fileContentsLoadedPromise;
            if (reader.error) {
                console.error('Could not convert blob to base64.', reader.error);
                return '';
            }
            const result = reader.result;
            if (result === undefined || result === null || typeof result !== 'string') {
                console.error('Could not convert blob to base64.');
                return '';
            }
            return result.substring(result.indexOf(',') + 1);
        }
    }
    continueRequestWithoutChange() {
        console.assert(!this.#hasRespondedInternal);
        this.#hasRespondedInternal = true;
        void this.#fetchAgent.invoke_continueRequest({ requestId: this.requestId });
    }
    continueRequestWithError(errorReason) {
        console.assert(!this.#hasRespondedInternal);
        this.#hasRespondedInternal = true;
        void this.#fetchAgent.invoke_failRequest({ requestId: this.requestId, errorReason });
    }
    async responseBody() {
        const response = await this.#fetchAgent.invoke_getResponseBody({ requestId: this.requestId });
        const error = response.getError() || null;
        return { error: error, content: error ? null : response.body, encoded: response.base64Encoded };
    }
}
/**
 * Helper class to match #requests created from requestWillBeSent with
 * requestWillBeSentExtraInfo and responseReceivedExtraInfo when they have the
 * same requestId due to redirects.
 */
class ExtraInfoBuilder {
    #requests;
    #requestExtraInfos;
    #responseExtraInfos;
    #finishedInternal;
    #webBundleInfo;
    #webBundleInnerRequestInfo;
    constructor() {
        this.#requests = [];
        this.#requestExtraInfos = [];
        this.#responseExtraInfos = [];
        this.#finishedInternal = false;
        this.#webBundleInfo = null;
        this.#webBundleInnerRequestInfo = null;
    }
    addRequest(req) {
        this.#requests.push(req);
        this.sync(this.#requests.length - 1);
    }
    addRequestExtraInfo(info) {
        this.#requestExtraInfos.push(info);
        this.sync(this.#requestExtraInfos.length - 1);
    }
    addResponseExtraInfo(info) {
        this.#responseExtraInfos.push(info);
        this.sync(this.#responseExtraInfos.length - 1);
    }
    setWebBundleInfo(info) {
        this.#webBundleInfo = info;
        this.updateFinalRequest();
    }
    setWebBundleInnerRequestInfo(info) {
        this.#webBundleInnerRequestInfo = info;
        this.updateFinalRequest();
    }
    finished() {
        this.#finishedInternal = true;
        this.updateFinalRequest();
    }
    sync(index) {
        const req = this.#requests[index];
        if (!req) {
            return;
        }
        const requestExtraInfo = this.#requestExtraInfos[index];
        if (requestExtraInfo) {
            req.addExtraRequestInfo(requestExtraInfo);
            this.#requestExtraInfos[index] = null;
        }
        const responseExtraInfo = this.#responseExtraInfos[index];
        if (responseExtraInfo) {
            req.addExtraResponseInfo(responseExtraInfo);
            this.#responseExtraInfos[index] = null;
        }
    }
    finalRequest() {
        if (!this.#finishedInternal) {
            return null;
        }
        return this.#requests[this.#requests.length - 1] || null;
    }
    updateFinalRequest() {
        if (!this.#finishedInternal) {
            return;
        }
        const finalRequest = this.finalRequest();
        finalRequest?.setWebBundleInfo(this.#webBundleInfo);
        finalRequest?.setWebBundleInnerRequestInfo(this.#webBundleInnerRequestInfo);
    }
}
SDKModel.register(NetworkManager, { capabilities: Capability.Network, autostart: true });
export class ConditionsSerializer {
    stringify(value) {
        const conditions = value;
        return JSON.stringify({
            ...conditions,
            title: typeof conditions.title === 'function' ? conditions.title() : conditions.title,
        });
    }
    parse(serialized) {
        const parsed = JSON.parse(serialized);
        return {
            ...parsed,
            // eslint-disable-next-line rulesdir/l10n_i18nString_call_only_with_uistrings
            title: parsed.i18nTitleKey ? i18nLazyString(parsed.i18nTitleKey) : parsed.title,
        };
    }
}
export function networkConditionsEqual(first, second) {
    // Caution: titles might be different function instances, which produce
    // the same value.
    const firstTitle = typeof first.title === 'function' ? first.title() : first.title;
    const secondTitle = typeof second.title === 'function' ? second.title() : second.title;
    return second.download === first.download && second.upload === first.upload && second.latency === first.latency &&
        secondTitle === firstTitle;
}
//# sourceMappingURL=NetworkManager.js.map
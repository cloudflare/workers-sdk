// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
const UIStrings = {
    /**
       * @description Description text for not restored reason NotMainFrame.
       */
    notMainFrame: 'Navigation happened in a frame other than the main frame.',
    /**
        * @description Description text for not restored reason BackForwardCacheDisabled.
        */
    backForwardCacheDisabled: 'Back/forward cache is disabled by flags. Visit chrome://flags/#back-forward-cache to enable it locally on this device.',
    /**
        * @description Description text for not restored reason RelatedActiveContentsExist.
        * Note: "window.open()" is the name of a JavaScript method and should not be translated.
        */
    relatedActiveContentsExist: 'The page was opened using \'`window.open()`\' and another tab has a reference to it, or the page opened a window.',
    /**
        * @description Description text for not restored reason HTTPStatusNotOK.
        */
    HTTPStatusNotOK: 'Only pages with a status code of 2XX can be cached.',
    /**
        * @description Description text for not restored reason SchemeNotHTTPOrHTTPS.
        */
    schemeNotHTTPOrHTTPS: 'Only pages whose URL scheme is HTTP / HTTPS can be cached.',
    /**
        * @description Description text for not restored reason Loading.
        */
    loading: 'The page did not finish loading before navigating away.',
    /**
        * @description Description text for not restored reason WasGrantedMediaAccess.
        */
    wasGrantedMediaAccess: 'Pages that have granted access to record video or audio are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason HTTPMethodNotGET.
        */
    HTTPMethodNotGET: 'Only pages loaded via a GET request are eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason SubframeIsNavigating.
        */
    subframeIsNavigating: 'An iframe on the page started a navigation that did not complete.',
    /**
        * @description Description text for not restored reason Timeout.
        */
    timeout: 'The page exceeded the maximum time in back/forward cache and was expired.',
    /**
        * @description Description text for not restored reason CacheLimit.
        */
    cacheLimit: 'The page was evicted from the cache to allow another page to be cached.',
    /**
        * @description Description text for not restored reason JavaScriptExecution.
        */
    JavaScriptExecution: 'Chrome detected an attempt to execute JavaScript while in the cache.',
    /**
        * @description Description text for not restored reason RendererProcessKilled.
        */
    rendererProcessKilled: 'The renderer process for the page in back/forward cache was killed.',
    /**
        * @description Description text for not restored reason RendererProcessCrashed.
        */
    rendererProcessCrashed: 'The renderer process for the page in back/forward cache crashed.',
    /**
        * @description Description text for not restored reason GrantedMediaStreamAccess.
        */
    grantedMediaStreamAccess: 'Pages that have granted media stream access are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason CacheFlushed.
        */
    cacheFlushed: 'The cache was intentionally cleared.',
    /**
        * @description Description text for not restored reason ServiceWorkerVersionActivation.
        */
    serviceWorkerVersionActivation: 'The page was evicted from back/forward cache due to a service worker activation.',
    /**
        * @description Description text for not restored reason SessionRestored.
        */
    sessionRestored: 'Chrome restarted and cleared the back/forward cache entries.',
    /**
        * @description Description text for not restored reason ServiceWorkerPostMessage.
        * Note: "MessageEvent" should not be translated.
        */
    serviceWorkerPostMessage: 'A service worker attempted to send the page in back/forward cache a `MessageEvent`.',
    /**
        * @description Description text for not restored reason EnteredBackForwardCacheBeforeServiceWorkerHostAdded.
        */
    enteredBackForwardCacheBeforeServiceWorkerHostAdded: 'A service worker was activated while the page was in back/forward cache.',
    /**
        * @description Description text for not restored reason ServiceWorkerClaim.
        */
    serviceWorkerClaim: 'The page was claimed by a service worker while it is in back/forward cache.',
    /**
        * @description Description text for not restored reason HaveInnerContents.
        */
    haveInnerContents: 'Pages that use portals are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason TimeoutPuttingInCache.
        */
    timeoutPuttingInCache: 'The page timed out entering back/forward cache (likely due to long-running pagehide handlers).',
    /**
        * @description Description text for not restored reason BackForwardCacheDisabledByLowMemory.
        */
    backForwardCacheDisabledByLowMemory: 'Back/forward cache is disabled due to insufficient memory.',
    /**
        * @description Description text for not restored reason BackForwardcCacheDisabledByCommandLine.
        */
    backForwardCacheDisabledByCommandLine: 'Back/forward cache is disabled by the command line.',
    /**
        * @description Description text for not restored reason NetworkRequestDatapipeDrainedAsBytesConsumer.
        */
    networkRequestDatapipeDrainedAsBytesConsumer: 'Pages that have inflight fetch() or XHR are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason NetworkRequestRedirected.
        */
    networkRequestRedirected: 'The page was evicted from back/forward cache because an active network request involved a redirect.',
    /**
        * @description Description text for not restored reason NetworkRequestTimeout.
        */
    networkRequestTimeout: 'The page was evicted from the cache because a network connection was open too long. Chrome limits the amount of time that a page may receive data while cached.',
    /**
        * @description Description text for not restored reason NetworkExceedsBufferLimit.
        */
    networkExceedsBufferLimit: 'The page was evicted from the cache because an active network connection received too much data. Chrome limits the amount of data that a page may receive while cached.',
    /**
        * @description Description text for not restored reason NavigationCancelledWhileRestoring.
        */
    navigationCancelledWhileRestoring: 'Navigation was cancelled before the page could be restored from back/forward cache.',
    /**
        * @description Description text for not restored reason BackForwardCacheDisabledForPrerender.
        */
    backForwardCacheDisabledForPrerender: 'Back/forward cache is disabled for prerenderer.',
    /**
        * @description Description text for not restored reason userAgentOverrideDiffers.
        */
    userAgentOverrideDiffers: 'Browser has changed the user agent override header.',
    /**
        * @description Description text for not restored reason ForegroundCacheLimit.
        */
    foregroundCacheLimit: 'The page was evicted from the cache to allow another page to be cached.',
    /**
        * @description Description text for not restored reason BackForwardCacheDisabledForDelegate.
        */
    backForwardCacheDisabledForDelegate: 'Back/forward cache is not supported by delegate.',
    /**
        * @description Description text for not restored reason UnloadHandlerExistsInMainFrame.
        */
    unloadHandlerExistsInMainFrame: 'The page has an unload handler in the main frame.',
    /**
        * @description Description text for not restored reason UnloadHandlerExistsInSubFrame.
        */
    unloadHandlerExistsInSubFrame: 'The page has an unload handler in a sub frame.',
    /**
        * @description Description text for not restored reason ServiceWorkerUnregistration.
        */
    serviceWorkerUnregistration: 'ServiceWorker was unregistered while a page was in back/forward cache.',
    /**
        * @description Description text for not restored reason NoResponseHead.
        */
    noResponseHead: 'Pages that do not have a valid response head cannot enter back/forward cache.',
    /**
        * @description Description text for not restored reason CacheControlNoStore.
        */
    cacheControlNoStore: 'Pages with cache-control:no-store header cannot enter back/forward cache.',
    /**
        * @description Description text for not restored reason IneligibleAPI.
        */
    ineligibleAPI: 'Ineligible APIs were used.',
    /**
        * @description Description text for not restored reason InternalError.
        */
    internalError: 'Internal error.',
    /**
        * @description Description text for not restored reason WebSocket.
        */
    webSocket: 'Pages with WebSocket cannot enter back/forward cache.',
    /**
        * @description Description text for not restored reason WebTransport.
        */
    webTransport: 'Pages with WebTransport cannot enter back/forward cache.',
    /**
        * @description Description text for not restored reason WebRTC.
        */
    webRTC: 'Pages with WebRTC cannot enter back/forward cache.',
    /**
        * @description Description text for not restored reason MainResourceHasCacheControlNoStore.
        */
    mainResourceHasCacheControlNoStore: 'Pages whose main resource has cache-control:no-store cannot enter back/forward cache.',
    /**
        * @description Description text for not restored reason MainResourceHasCacheControlNoCache.
        */
    mainResourceHasCacheControlNoCache: 'Pages whose main resource has cache-control:no-cache cannot enter back/forward cache.',
    /**
        * @description Description text for not restored reason SubresourceHasCacheControlNoStore.
        */
    subresourceHasCacheControlNoStore: 'Pages whose subresource has cache-control:no-store cannot enter back/forward cache.',
    /**
        * @description Description text for not restored reason SubresourceHasCacheControlNoCache.
        */
    subresourceHasCacheControlNoCache: 'Pages whose subresource has cache-control:no-cache cannot enter back/forward cache.',
    /**
        * @description Description text for not restored reason ContainsPlugins.
        */
    containsPlugins: 'Pages containing plugins are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason DocumentLoaded.
        */
    documentLoaded: 'The document did not finish loading before navigating away.',
    /**
        * @description Description text for not restored reason DedicatedWorkerOrWorklet.
        */
    dedicatedWorkerOrWorklet: 'Pages that use a dedicated worker or worklet are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason OutstandingNetworkRequestOthers.
        */
    outstandingNetworkRequestOthers: 'Pages with an in-flight network request are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason OutstandingIndexedDBTransaction.
        */
    outstandingIndexedDBTransaction: 'Page with ongoing indexed DB transactions are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason RequestedNotificationsPermission.
        */
    requestedNotificationsPermission: 'Pages that have requested notifications permissions are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason RequestedMIDIPermission.
        */
    requestedMIDIPermission: 'Pages that have requested MIDI permissions are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason RequestedAudioCapturePermission.
        */
    requestedAudioCapturePermission: 'Pages that have requested audio capture permissions are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason RequestedVideoCapturePermission.
        */
    requestedVideoCapturePermission: 'Pages that have requested video capture permissions are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason RequestedBackForwardCacheBlockedSensors.
        */
    requestedBackForwardCacheBlockedSensors: 'Pages that have requested sensor permissions are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason RequestedBackgroundWorkPermission.
        */
    requestedBackgroundWorkPermission: 'Pages that have requested background sync or fetch permissions are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason BroadcastChannel.
        */
    broadcastChannel: 'The page cannot be cached because it has a BroadcastChannel instance with registered listeners.',
    /**
        * @description Description text for not restored reason IndexedDBConnection.
        */
    indexedDBConnection: 'Pages that have an open IndexedDB connection are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason WebXR.
        */
    webXR: 'Pages that use WebXR are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason SharedWorker.
        */
    sharedWorker: 'Pages that use SharedWorker are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason WebLocks.
        */
    webLocks: 'Pages that use WebLocks are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason WebHID.
        */
    webHID: 'Pages that use WebHID are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason WebShare.
        */
    webShare: 'Pages that use WebShare are not currently eligible for back/forwad cache.',
    /**
        * @description Description text for not restored reason RequestedStorageAccessGrant.
        */
    requestedStorageAccessGrant: 'Pages that have requested storage access are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason WebNfc.
        */
    webNfc: 'Pages that use WebNfc are not currently eligible for back/forwad cache.',
    /**
        * @description Description text for not restored reason OutstandingNetworkRequestFetch.
        */
    outstandingNetworkRequestFetch: 'Pages with an in-flight fetch network request are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason OutstandingNetworkRequestXHR.
        */
    outstandingNetworkRequestXHR: 'Pages with an in-flight XHR network request are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason AppBanner.
        */
    appBanner: 'Pages that requested an AppBanner are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason Printing.
        */
    printing: 'Pages that show Printing UI are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason WebDatabase.
        */
    webDatabase: 'Pages that use WebDatabase are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason PictureInPicture.
        */
    pictureInPicture: 'Pages that use Picture-in-Picture are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason Portal.
        */
    portal: 'Pages that use portals are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason SpeechRecognizer.
        */
    speechRecognizer: 'Pages that use SpeechRecognizer are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason IdleManager.
        */
    idleManager: 'Pages that use IdleManager are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason PaymentManager.
        */
    paymentManager: 'Pages that use PaymentManager are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason SpeechSynthesis.
        */
    speechSynthesis: 'Pages that use SpeechSynthesis are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason KeyboardLock.
        */
    keyboardLock: 'Pages that use Keyboard lock are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason WebOTPService.
        */
    webOTPService: 'Pages that use WebOTPService are not currently eligible for bfcache.',
    /**
        * @description Description text for not restored reason OutstandingNetworkRequestDirectSocket.
        */
    outstandingNetworkRequestDirectSocket: 'Pages with an in-flight network request are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason InjectedJavascript.
        */
    injectedJavascript: 'IPages that JavaScript is injected into by extensions are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason InjectedStyleSheet.
        */
    injectedStyleSheet: 'Pages that StyleSheet is injected into by extensions are not currently eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason ContentSecurityHandler.
        */
    contentSecurityHandler: 'Pages that use SecurityHandler are not eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason NotMainFrame.
        */
    contentWebAuthenticationAPI: 'Pages that use WebAuthetication API are not eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason NotMainFrame.
        */
    contentFileChooser: 'Pages that use FileChooser API are not eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason NotMainFrame.
        */
    contentSerial: 'Pages that use Serial API are not eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason NotMainFrame.
        */
    contentFileSystemAccess: 'Pages that use File System Access API are not eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason NotMainFrame.
        */
    contentMediaDevicesDispatcherHost: 'Pages that use Media Device Dispatcher are not eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason NotMainFrame.
        */
    contentWebBluetooth: 'Pages that use WebBluetooth API are not eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason ContentWebUSB.
        */
    contentWebUSB: 'Pages that use WebUSB API are not eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason ContentMediaSession.
        */
    contentMediaSession: 'Pages that use MediaSession API and set a playback state are not eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason ContentMediaSessionService.
        */
    contentMediaSessionService: 'Pages that use MediaSession API and set action handlers are not eligible for back/forward cache.',
    /**
        * @description Description text for not restored reason ContentMediaPlay.
        */
    contentMediaPlay: 'A media player was playing upon navigating away.',
    /**
        * @description Description text for not restored reason ContentScreenReader.
        */
    contentScreenReader: 'Back/forward cache is disabled due to screen reader.',
    /**
   *  @description Description text for not restored reason EmbedderPopupBlockerTabHelper.
   */
    embedderPopupBlockerTabHelper: 'Popup blocker was present upon navigating away.',
    /**
   *  @description Description text for not restored reason EmbedderSafeBrowsingTriggeredPopupBlocker.
   */
    embedderSafeBrowsingTriggeredPopupBlocker: 'Safe Browsing considered this page to be abusive and blocked popup.',
    /**
   *  @description Description text for not restored reason EmbedderSafeBrowsingThreatDetails.
   */
    embedderSafeBrowsingThreatDetails: 'Safe Browsing details were shown upon navigating away.',
    /**
   *  @description Description text for not restored reason EmbedderAppBannerManager.
   */
    embedderAppBannerManager: 'App Banner was present upon navigating away.',
    /**
   *  @description Description text for not restored reason EmbedderDomDistillerViewerSource.
   */
    embedderDomDistillerViewerSource: 'DOM Distiller Viewer was present upon navigating away.',
    /**
   *  @description Description text for not restored reason EmbedderDomDistillerSelfDeletingRequestDelegate.
   */
    embedderDomDistillerSelfDeletingRequestDelegate: 'DOM distillation was in progress upon navigating away.',
    /**
   *  @description Description text for not restored reason EmbedderOomInterventionTabHelper.
   */
    embedderOomInterventionTabHelper: 'Out-Of-Memory Intervention bar was present upon navigating away.',
    /**
   *  @description Description text for not restored reason EmbedderOfflinePage.
   */
    embedderOfflinePage: 'The offline page was shown upon navigating away.',
    /**
   *  @description Description text for not restored reason EmbedderChromePasswordManagerClientBindCredentialManager.
   */
    embedderChromePasswordManagerClientBindCredentialManager: 'Chrome Password Manager was present upon navigating away.',
    /**
   *  @description Description text for not restored reason EmbedderPermissionRequestManager.
   */
    embedderPermissionRequestManager: 'There were permission requests upon navigating away.',
    /**
   *  @description Description text for not restored reason EmbedderModalDialog.
   */
    embedderModalDialog: 'Modal dialog such as form resubmission or http password dialog was shown for the page upon navigating away.',
    /**
   *  @description Description text for not restored reason EmbedderExtensions.
   */
    embedderExtensions: 'Back/forward cache is disabled due to extensions.',
    /**
   *  @description Description text for not restored reason EmbedderExtensionMessaging.
   */
    embedderExtensionMessaging: 'Back/forward cache is disabled due to extensions using messaging API.',
    /**
   *  @description Description text for not restored reason EmbedderExtensionMessagingForOpenPort.
   */
    embedderExtensionMessagingForOpenPort: 'Extensions with long-lived connection should close the connection before entering back/forward cache.',
    /**
   *  @description Description text for not restored reason EmbedderExtensionSentMessageToCachedFrame.
   */
    embedderExtensionSentMessageToCachedFrame: 'Extensions with long-lived connection attempted to send messages to frames in back/forward cache.',
    /**
   *  @description Description text for not restored reason ErrorDocument.
   */
    errorDocument: 'Back/forward cache is disabled due to a document error.',
    /**
   *  @description Description text for not restored reason ErrorDocument.
   */
    fencedFramesEmbedder: 'Pages using FencedFrames cannot be stored in bfcache.',
};
const str_ = i18n.i18n.registerUIStrings('panels/application/components/BackForwardCacheStrings.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
export const NotRestoredReasonDescription = {
    'NotPrimaryMainFrame': { name: i18nLazyString(UIStrings.notMainFrame) },
    'BackForwardCacheDisabled': { name: i18nLazyString(UIStrings.backForwardCacheDisabled) },
    'RelatedActiveContentsExist': { name: i18nLazyString(UIStrings.relatedActiveContentsExist) },
    'HTTPStatusNotOK': { name: i18nLazyString(UIStrings.HTTPStatusNotOK) },
    'SchemeNotHTTPOrHTTPS': { name: i18nLazyString(UIStrings.schemeNotHTTPOrHTTPS) },
    'Loading': { name: i18nLazyString(UIStrings.loading) },
    'WasGrantedMediaAccess': { name: i18nLazyString(UIStrings.wasGrantedMediaAccess) },
    'HTTPMethodNotGET': { name: i18nLazyString(UIStrings.HTTPMethodNotGET) },
    'SubframeIsNavigating': { name: i18nLazyString(UIStrings.subframeIsNavigating) },
    'Timeout': { name: i18nLazyString(UIStrings.timeout) },
    'CacheLimit': { name: i18nLazyString(UIStrings.cacheLimit) },
    'JavaScriptExecution': { name: i18nLazyString(UIStrings.JavaScriptExecution) },
    'RendererProcessKilled': { name: i18nLazyString(UIStrings.rendererProcessKilled) },
    'RendererProcessCrashed': { name: i18nLazyString(UIStrings.rendererProcessCrashed) },
    'GrantedMediaStreamAccess': { name: i18nLazyString(UIStrings.grantedMediaStreamAccess) },
    'CacheFlushed': { name: i18nLazyString(UIStrings.cacheFlushed) },
    'ServiceWorkerVersionActivation': { name: i18nLazyString(UIStrings.serviceWorkerVersionActivation) },
    'SessionRestored': { name: i18nLazyString(UIStrings.sessionRestored) },
    'ServiceWorkerPostMessage': { name: i18nLazyString(UIStrings.serviceWorkerPostMessage) },
    'EnteredBackForwardCacheBeforeServiceWorkerHostAdded': { name: i18nLazyString(UIStrings.enteredBackForwardCacheBeforeServiceWorkerHostAdded) },
    'ServiceWorkerClaim': { name: i18nLazyString(UIStrings.serviceWorkerClaim) },
    'HaveInnerContents': { name: i18nLazyString(UIStrings.haveInnerContents) },
    'TimeoutPuttingInCache': { name: i18nLazyString(UIStrings.timeoutPuttingInCache) },
    'BackForwardCacheDisabledByLowMemory': { name: i18nLazyString(UIStrings.backForwardCacheDisabledByLowMemory) },
    'BackForwardCacheDisabledByCommandLine': { name: i18nLazyString(UIStrings.backForwardCacheDisabledByCommandLine) },
    'NetworkRequestDatapipeDrainedAsBytesConsumer': { name: i18nLazyString(UIStrings.networkRequestDatapipeDrainedAsBytesConsumer) },
    'NetworkRequestRedirected': { name: i18nLazyString(UIStrings.networkRequestRedirected) },
    'NetworkRequestTimeout': { name: i18nLazyString(UIStrings.networkRequestTimeout) },
    'NetworkExceedsBufferLimit': { name: i18nLazyString(UIStrings.networkExceedsBufferLimit) },
    'NavigationCancelledWhileRestoring': { name: i18nLazyString(UIStrings.navigationCancelledWhileRestoring) },
    'BackForwardCacheDisabledForPrerender': { name: i18nLazyString(UIStrings.backForwardCacheDisabledForPrerender) },
    'UserAgentOverrideDiffers': { name: i18nLazyString(UIStrings.userAgentOverrideDiffers) },
    'ForegroundCacheLimit': { name: i18nLazyString(UIStrings.foregroundCacheLimit) },
    'BackForwardCacheDisabledForDelegate': { name: i18nLazyString(UIStrings.backForwardCacheDisabledForDelegate) },
    'UnloadHandlerExistsInMainFrame': { name: i18nLazyString(UIStrings.unloadHandlerExistsInMainFrame) },
    'UnloadHandlerExistsInSubFrame': { name: i18nLazyString(UIStrings.unloadHandlerExistsInSubFrame) },
    'ServiceWorkerUnregistration': { name: i18nLazyString(UIStrings.serviceWorkerUnregistration) },
    'NoResponseHead': { name: i18nLazyString(UIStrings.noResponseHead) },
    'CacheControlNoStore': { name: i18nLazyString(UIStrings.cacheControlNoStore) },
    'CacheControlNoStoreCookieModified': { name: i18nLazyString(UIStrings.cacheControlNoStore) },
    'CacheControlNoStoreHTTPOnlyCookieModified': { name: i18nLazyString(UIStrings.cacheControlNoStore) },
    'DisableForRenderFrameHostCalled': { name: i18nLazyString(UIStrings.ineligibleAPI) },
    'BlocklistedFeatures': { name: i18nLazyString(UIStrings.ineligibleAPI) },
    'SchedulerTrackedFeatureUsed': { name: i18nLazyString(UIStrings.ineligibleAPI) },
    'DomainNotAllowed': { name: i18nLazyString(UIStrings.internalError) },
    'ConflictingBrowsingInstance': { name: i18nLazyString(UIStrings.internalError) },
    'NotMostRecentNavigationEntry': { name: i18nLazyString(UIStrings.internalError) },
    'IgnoreEventAndEvict': { name: i18nLazyString(UIStrings.internalError) },
    'BrowsingInstanceNotSwapped': { name: i18nLazyString(UIStrings.internalError) },
    'ActivationNavigationsDisallowedForBug1234857': { name: i18nLazyString(UIStrings.internalError) },
    'Unknown': { name: i18nLazyString(UIStrings.internalError) },
    'RenderFrameHostReused_SameSite': { name: i18nLazyString(UIStrings.internalError) },
    'RenderFrameHostReused_CrossSite': { name: i18nLazyString(UIStrings.internalError) },
    'WebSocket': { name: i18nLazyString(UIStrings.webSocket) },
    'WebTransport': { name: i18nLazyString(UIStrings.webTransport) },
    'WebRTC': { name: i18nLazyString(UIStrings.webRTC) },
    'MainResourceHasCacheControlNoStore': { name: i18nLazyString(UIStrings.mainResourceHasCacheControlNoStore) },
    'MainResourceHasCacheControlNoCache': { name: i18nLazyString(UIStrings.mainResourceHasCacheControlNoCache) },
    'SubresourceHasCacheControlNoStore': { name: i18nLazyString(UIStrings.subresourceHasCacheControlNoStore) },
    'SubresourceHasCacheControlNoCache': { name: i18nLazyString(UIStrings.subresourceHasCacheControlNoCache) },
    'ContainsPlugins': { name: i18nLazyString(UIStrings.containsPlugins) },
    'DocumentLoaded': { name: i18nLazyString(UIStrings.documentLoaded) },
    'DedicatedWorkerOrWorklet': { name: i18nLazyString(UIStrings.dedicatedWorkerOrWorklet) },
    'OutstandingNetworkRequestOthers': { name: i18nLazyString(UIStrings.outstandingNetworkRequestOthers) },
    'OutstandingIndexedDBTransaction': { name: i18nLazyString(UIStrings.outstandingIndexedDBTransaction) },
    'RequestedNotificationsPermission': { name: i18nLazyString(UIStrings.requestedNotificationsPermission) },
    'RequestedMIDIPermission': { name: i18nLazyString(UIStrings.requestedMIDIPermission) },
    'RequestedAudioCapturePermission': { name: i18nLazyString(UIStrings.requestedAudioCapturePermission) },
    'RequestedVideoCapturePermission': { name: i18nLazyString(UIStrings.requestedVideoCapturePermission) },
    'RequestedBackForwardCacheBlockedSensors': { name: i18nLazyString(UIStrings.requestedBackForwardCacheBlockedSensors) },
    'RequestedBackgroundWorkPermission': { name: i18nLazyString(UIStrings.requestedBackgroundWorkPermission) },
    'BroadcastChannel': { name: i18nLazyString(UIStrings.broadcastChannel) },
    'IndexedDBConnection': { name: i18nLazyString(UIStrings.indexedDBConnection) },
    'WebXR': { name: i18nLazyString(UIStrings.webXR) },
    'SharedWorker': { name: i18nLazyString(UIStrings.sharedWorker) },
    'WebLocks': { name: i18nLazyString(UIStrings.webLocks) },
    'WebHID': { name: i18nLazyString(UIStrings.webHID) },
    'WebShare': { name: i18nLazyString(UIStrings.webShare) },
    'RequestedStorageAccessGrant': { name: i18nLazyString(UIStrings.requestedStorageAccessGrant) },
    'WebNfc': { name: i18nLazyString(UIStrings.webNfc) },
    'OutstandingNetworkRequestFetch': { name: i18nLazyString(UIStrings.outstandingNetworkRequestFetch) },
    'OutstandingNetworkRequestXHR': { name: i18nLazyString(UIStrings.outstandingNetworkRequestXHR) },
    'AppBanner': { name: i18nLazyString(UIStrings.appBanner) },
    'Printing': { name: i18nLazyString(UIStrings.printing) },
    'WebDatabase': { name: i18nLazyString(UIStrings.webDatabase) },
    'PictureInPicture': { name: i18nLazyString(UIStrings.pictureInPicture) },
    'Portal': { name: i18nLazyString(UIStrings.portal) },
    'SpeechRecognizer': { name: i18nLazyString(UIStrings.speechRecognizer) },
    'IdleManager': { name: i18nLazyString(UIStrings.idleManager) },
    'PaymentManager': { name: i18nLazyString(UIStrings.paymentManager) },
    'SpeechSynthesis': { name: i18nLazyString(UIStrings.speechSynthesis) },
    'KeyboardLock': { name: i18nLazyString(UIStrings.keyboardLock) },
    'WebOTPService': { name: i18nLazyString(UIStrings.webOTPService) },
    'OutstandingNetworkRequestDirectSocket': { name: i18nLazyString(UIStrings.outstandingNetworkRequestDirectSocket) },
    'InjectedJavascript': { name: i18nLazyString(UIStrings.injectedJavascript) },
    'InjectedStyleSheet': { name: i18nLazyString(UIStrings.injectedStyleSheet) },
    'Dummy': { name: i18nLazyString(UIStrings.internalError) },
    'ContentSecurityHandler': { name: i18nLazyString(UIStrings.contentSecurityHandler) },
    'ContentWebAuthenticationAPI': { name: i18nLazyString(UIStrings.contentWebAuthenticationAPI) },
    'ContentFileChooser': { name: i18nLazyString(UIStrings.contentFileChooser) },
    'ContentSerial': { name: i18nLazyString(UIStrings.contentSerial) },
    'ContentFileSystemAccess': { name: i18nLazyString(UIStrings.contentFileSystemAccess) },
    'ContentMediaDevicesDispatcherHost': { name: i18nLazyString(UIStrings.contentMediaDevicesDispatcherHost) },
    'ContentWebBluetooth': { name: i18nLazyString(UIStrings.contentWebBluetooth) },
    'ContentWebUSB': { name: i18nLazyString(UIStrings.contentWebUSB) },
    'ContentMediaSession': { name: i18nLazyString(UIStrings.contentMediaSession) },
    'ContentMediaSessionService': { name: i18nLazyString(UIStrings.contentMediaSessionService) },
    'ContentMediaPlay': { name: i18nLazyString(UIStrings.contentMediaPlay) },
    'ContentScreenReader': { name: i18nLazyString(UIStrings.contentScreenReader) },
    'EmbedderPopupBlockerTabHelper': { name: i18nLazyString(UIStrings.embedderPopupBlockerTabHelper) },
    'EmbedderSafeBrowsingTriggeredPopupBlocker': { name: i18nLazyString(UIStrings.embedderSafeBrowsingTriggeredPopupBlocker) },
    'EmbedderSafeBrowsingThreatDetails': { name: i18nLazyString(UIStrings.embedderSafeBrowsingThreatDetails) },
    'EmbedderAppBannerManager': { name: i18nLazyString(UIStrings.embedderAppBannerManager) },
    'EmbedderDomDistillerViewerSource': { name: i18nLazyString(UIStrings.embedderDomDistillerViewerSource) },
    'EmbedderDomDistillerSelfDeletingRequestDelegate': { name: i18nLazyString(UIStrings.embedderDomDistillerSelfDeletingRequestDelegate) },
    'EmbedderOomInterventionTabHelper': { name: i18nLazyString(UIStrings.embedderOomInterventionTabHelper) },
    'EmbedderOfflinePage': { name: i18nLazyString(UIStrings.embedderOfflinePage) },
    'EmbedderChromePasswordManagerClientBindCredentialManager': { name: i18nLazyString(UIStrings.embedderChromePasswordManagerClientBindCredentialManager) },
    'EmbedderPermissionRequestManager': { name: i18nLazyString(UIStrings.embedderPermissionRequestManager) },
    'EmbedderModalDialog': { name: i18nLazyString(UIStrings.embedderModalDialog) },
    'EmbedderExtensions': { name: i18nLazyString(UIStrings.embedderExtensions) },
    'EmbedderExtensionMessaging': { name: i18nLazyString(UIStrings.embedderExtensionMessaging) },
    'EmbedderExtensionMessagingForOpenPort': { name: i18nLazyString(UIStrings.embedderExtensionMessagingForOpenPort) },
    'EmbedderExtensionSentMessageToCachedFrame': { name: i18nLazyString(UIStrings.embedderExtensionSentMessageToCachedFrame) },
    'ErrorDocument': { name: i18nLazyString(UIStrings.errorDocument) },
    'FencedFramesEmbedder': { name: i18nLazyString(UIStrings.fencedFramesEmbedder) },
};
//# sourceMappingURL=BackForwardCacheStrings.js.map
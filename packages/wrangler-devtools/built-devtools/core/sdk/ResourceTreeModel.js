// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the #name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../common/common.js';
import * as i18n from '../i18n/i18n.js';
import * as Platform from '../platform/platform.js';
import { DOMModel } from './DOMModel.js';
import { Events as NetworkManagerEvents, NetworkManager } from './NetworkManager.js';
import { Resource } from './Resource.js';
import { ExecutionContext, RuntimeModel } from './RuntimeModel.js';
import { Capability } from './Target.js';
import { SDKModel } from './SDKModel.js';
import { TargetManager } from './TargetManager.js';
import { SecurityOriginManager } from './SecurityOriginManager.js';
import { StorageKeyManager } from './StorageKeyManager.js';
export class ResourceTreeModel extends SDKModel {
    agent;
    storageAgent;
    #securityOriginManager;
    #storageKeyManager;
    framesInternal;
    #cachedResourcesProcessed;
    #pendingReloadOptions;
    #reloadSuspensionCount;
    isInterstitialShowing;
    mainFrame;
    #pendingBackForwardCacheNotUsedEvents;
    #pendingPrerenderAttemptCompletedEvents;
    constructor(target) {
        super(target);
        const networkManager = target.model(NetworkManager);
        if (networkManager) {
            networkManager.addEventListener(NetworkManagerEvents.RequestFinished, this.onRequestFinished, this);
            networkManager.addEventListener(NetworkManagerEvents.RequestUpdateDropped, this.onRequestUpdateDropped, this);
        }
        this.agent = target.pageAgent();
        this.storageAgent = target.storageAgent();
        void this.agent.invoke_enable();
        this.#securityOriginManager = target.model(SecurityOriginManager);
        this.#storageKeyManager = target.model(StorageKeyManager);
        this.#pendingBackForwardCacheNotUsedEvents = new Set();
        this.#pendingPrerenderAttemptCompletedEvents = new Set();
        target.registerPageDispatcher(new PageDispatcher(this));
        this.framesInternal = new Map();
        this.#cachedResourcesProcessed = false;
        this.#pendingReloadOptions = null;
        this.#reloadSuspensionCount = 0;
        this.isInterstitialShowing = false;
        this.mainFrame = null;
        void this.agent.invoke_getResourceTree().then(event => {
            this.processCachedResources(event.getError() ? null : event.frameTree);
        });
    }
    static frameForRequest(request) {
        const networkManager = NetworkManager.forRequest(request);
        const resourceTreeModel = networkManager ? networkManager.target().model(ResourceTreeModel) : null;
        if (!resourceTreeModel) {
            return null;
        }
        return request.frameId ? resourceTreeModel.frameForId(request.frameId) : null;
    }
    static frames() {
        const result = [];
        for (const resourceTreeModel of TargetManager.instance().models(ResourceTreeModel)) {
            result.push(...resourceTreeModel.framesInternal.values());
        }
        return result;
    }
    static resourceForURL(url) {
        for (const resourceTreeModel of TargetManager.instance().models(ResourceTreeModel)) {
            const mainFrame = resourceTreeModel.mainFrame;
            const result = mainFrame ? mainFrame.resourceForURL(url) : null;
            if (result) {
                return result;
            }
        }
        return null;
    }
    static reloadAllPages(bypassCache, scriptToEvaluateOnLoad) {
        for (const resourceTreeModel of TargetManager.instance().models(ResourceTreeModel)) {
            if (!resourceTreeModel.target().parentTarget()) {
                resourceTreeModel.reloadPage(bypassCache, scriptToEvaluateOnLoad);
            }
        }
    }
    async storageKeyForFrame(frameId) {
        const response = await this.storageAgent.invoke_getStorageKeyForFrame({ frameId: frameId });
        if (response.getError() === 'Frame tree node for given frame not found') {
            return null;
        }
        return response.storageKey;
    }
    domModel() {
        return this.target().model(DOMModel);
    }
    processCachedResources(mainFramePayload) {
        // TODO(caseq): the url check below is a mergeable, conservative
        // workaround for a problem caused by us requesting resources from a
        // subtarget frame before it has committed. The proper fix is likely
        // to be too complicated to be safely merged.
        // See https://crbug.com/1081270 for details.
        if (mainFramePayload && mainFramePayload.frame.url !== ':') {
            this.dispatchEventToListeners(Events.WillLoadCachedResources);
            this.addFramesRecursively(null, mainFramePayload);
            this.target().setInspectedURL(mainFramePayload.frame.url);
        }
        this.#cachedResourcesProcessed = true;
        const runtimeModel = this.target().model(RuntimeModel);
        if (runtimeModel) {
            runtimeModel.setExecutionContextComparator(this.executionContextComparator.bind(this));
            runtimeModel.fireExecutionContextOrderChanged();
        }
        this.dispatchEventToListeners(Events.CachedResourcesLoaded, this);
    }
    cachedResourcesLoaded() {
        return this.#cachedResourcesProcessed;
    }
    addFrame(frame, _aboutToNavigate) {
        this.framesInternal.set(frame.id, frame);
        if (frame.isMainFrame()) {
            this.mainFrame = frame;
        }
        this.dispatchEventToListeners(Events.FrameAdded, frame);
        this.updateSecurityOrigins();
        void this.updateStorageKeys();
    }
    frameAttached(frameId, parentFrameId, stackTrace, adScriptId) {
        const sameTargetParentFrame = parentFrameId ? (this.framesInternal.get(parentFrameId) || null) : null;
        // Do nothing unless cached resource tree is processed - it will overwrite everything.
        if (!this.#cachedResourcesProcessed && sameTargetParentFrame) {
            return null;
        }
        if (this.framesInternal.has(frameId)) {
            return null;
        }
        const frame = new ResourceTreeFrame(this, sameTargetParentFrame, frameId, null, stackTrace || null, adScriptId || null);
        if (parentFrameId && !sameTargetParentFrame) {
            frame.crossTargetParentFrameId = parentFrameId;
        }
        if (frame.isMainFrame() && this.mainFrame) {
            // Navigation to the new backend process.
            this.frameDetached(this.mainFrame.id, false);
        }
        this.addFrame(frame, true);
        return frame;
    }
    frameNavigated(framePayload, type) {
        const sameTargetParentFrame = framePayload.parentId ? (this.framesInternal.get(framePayload.parentId) || null) : null;
        // Do nothing unless cached resource tree is processed - it will overwrite everything.
        if (!this.#cachedResourcesProcessed && sameTargetParentFrame) {
            return;
        }
        let frame = this.framesInternal.get(framePayload.id) || null;
        if (!frame) {
            // Simulate missed "frameAttached" for a main frame navigation to the new backend process.
            frame = this.frameAttached(framePayload.id, framePayload.parentId || null);
            console.assert(Boolean(frame));
            if (!frame) {
                return;
            }
        }
        this.dispatchEventToListeners(Events.FrameWillNavigate, frame);
        frame.navigate(framePayload);
        if (type) {
            frame.backForwardCacheDetails.restoredFromCache = type === "BackForwardCacheRestore" /* BackForwardCacheRestore */;
        }
        this.dispatchEventToListeners(Events.FrameNavigated, frame);
        if (frame.isMainFrame()) {
            this.processPendingEvents(frame);
            this.dispatchEventToListeners(Events.MainFrameNavigated, frame);
            const networkManager = this.target().model(NetworkManager);
            if (networkManager) {
                networkManager.clearRequests();
            }
        }
        // Fill frame with retained resources (the ones loaded using new loader).
        const resources = frame.resources();
        for (let i = 0; i < resources.length; ++i) {
            this.dispatchEventToListeners(Events.ResourceAdded, resources[i]);
        }
        if (frame.isMainFrame()) {
            this.target().setInspectedURL(frame.url);
        }
        this.updateSecurityOrigins();
        void this.updateStorageKeys();
    }
    documentOpened(framePayload) {
        this.frameNavigated(framePayload, undefined);
        const frame = this.framesInternal.get(framePayload.id);
        if (frame && !frame.getResourcesMap().get(framePayload.url)) {
            const frameResource = this.createResourceFromFramePayload(framePayload, framePayload.url, Common.ResourceType.resourceTypes.Document, framePayload.mimeType, null, null);
            frameResource.isGenerated = true;
            frame.addResource(frameResource);
        }
    }
    frameDetached(frameId, isSwap) {
        // Do nothing unless cached resource tree is processed - it will overwrite everything.
        if (!this.#cachedResourcesProcessed) {
            return;
        }
        const frame = this.framesInternal.get(frameId);
        if (!frame) {
            return;
        }
        const sameTargetParentFrame = frame.sameTargetParentFrame();
        if (sameTargetParentFrame) {
            sameTargetParentFrame.removeChildFrame(frame, isSwap);
        }
        else {
            frame.remove(isSwap);
        }
        this.updateSecurityOrigins();
        void this.updateStorageKeys();
    }
    onRequestFinished(event) {
        if (!this.#cachedResourcesProcessed) {
            return;
        }
        const request = event.data;
        if (request.failed || request.resourceType() === Common.ResourceType.resourceTypes.XHR) {
            return;
        }
        const frame = request.frameId ? this.framesInternal.get(request.frameId) : null;
        if (frame) {
            frame.addRequest(request);
        }
    }
    onRequestUpdateDropped(event) {
        if (!this.#cachedResourcesProcessed) {
            return;
        }
        const data = event.data;
        const frameId = data.frameId;
        if (!frameId) {
            return;
        }
        const frame = this.framesInternal.get(frameId);
        if (!frame) {
            return;
        }
        const url = data.url;
        if (frame.getResourcesMap().get(url)) {
            return;
        }
        const resource = new Resource(this, null, url, frame.url, frameId, data.loaderId, Common.ResourceType.resourceTypes[data.resourceType], data.mimeType, data.lastModified, null);
        frame.addResource(resource);
    }
    frameForId(frameId) {
        return this.framesInternal.get(frameId) || null;
    }
    forAllResources(callback) {
        if (this.mainFrame) {
            return this.mainFrame.callForFrameResources(callback);
        }
        return false;
    }
    frames() {
        return [...this.framesInternal.values()];
    }
    resourceForURL(url) {
        // Workers call into this with no #frames available.
        return this.mainFrame ? this.mainFrame.resourceForURL(url) : null;
    }
    addFramesRecursively(sameTargetParentFrame, frameTreePayload) {
        const framePayload = frameTreePayload.frame;
        const frame = new ResourceTreeFrame(this, sameTargetParentFrame, framePayload.id, framePayload, null, null);
        if (!sameTargetParentFrame && framePayload.parentId) {
            frame.crossTargetParentFrameId = framePayload.parentId;
        }
        this.addFrame(frame);
        for (const childFrame of frameTreePayload.childFrames || []) {
            this.addFramesRecursively(frame, childFrame);
        }
        for (let i = 0; i < frameTreePayload.resources.length; ++i) {
            const subresource = frameTreePayload.resources[i];
            const resource = this.createResourceFromFramePayload(framePayload, subresource.url, Common.ResourceType.resourceTypes[subresource.type], subresource.mimeType, subresource.lastModified || null, subresource.contentSize || null);
            frame.addResource(resource);
        }
        if (!frame.getResourcesMap().get(framePayload.url)) {
            const frameResource = this.createResourceFromFramePayload(framePayload, framePayload.url, Common.ResourceType.resourceTypes.Document, framePayload.mimeType, null, null);
            frame.addResource(frameResource);
        }
    }
    createResourceFromFramePayload(frame, url, type, mimeType, lastModifiedTime, contentSize) {
        const lastModified = typeof lastModifiedTime === 'number' ? new Date(lastModifiedTime * 1000) : null;
        return new Resource(this, null, url, frame.url, frame.id, frame.loaderId, type, mimeType, lastModified, contentSize);
    }
    suspendReload() {
        this.#reloadSuspensionCount++;
    }
    resumeReload() {
        this.#reloadSuspensionCount--;
        console.assert(this.#reloadSuspensionCount >= 0, 'Unbalanced call to ResourceTreeModel.resumeReload()');
        if (!this.#reloadSuspensionCount && this.#pendingReloadOptions) {
            const { ignoreCache, scriptToEvaluateOnLoad } = this.#pendingReloadOptions;
            this.reloadPage(ignoreCache, scriptToEvaluateOnLoad);
        }
    }
    reloadPage(ignoreCache, scriptToEvaluateOnLoad) {
        // Only dispatch PageReloadRequested upon first reload request to simplify client logic.
        if (!this.#pendingReloadOptions) {
            this.dispatchEventToListeners(Events.PageReloadRequested, this);
        }
        if (this.#reloadSuspensionCount) {
            this.#pendingReloadOptions = { ignoreCache, scriptToEvaluateOnLoad };
            return;
        }
        this.#pendingReloadOptions = null;
        const networkManager = this.target().model(NetworkManager);
        if (networkManager) {
            networkManager.clearRequests();
        }
        this.dispatchEventToListeners(Events.WillReloadPage);
        void this.agent.invoke_reload({ ignoreCache, scriptToEvaluateOnLoad });
    }
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate(url) {
        return this.agent.invoke_navigate({ url });
    }
    async navigationHistory() {
        const response = await this.agent.invoke_getNavigationHistory();
        if (response.getError()) {
            return null;
        }
        return { currentIndex: response.currentIndex, entries: response.entries };
    }
    navigateToHistoryEntry(entry) {
        void this.agent.invoke_navigateToHistoryEntry({ entryId: entry.id });
    }
    setLifecycleEventsEnabled(enabled) {
        return this.agent.invoke_setLifecycleEventsEnabled({ enabled });
    }
    async fetchAppManifest() {
        const response = await this.agent.invoke_getAppManifest();
        if (response.getError()) {
            return { url: response.url, data: null, errors: [] };
        }
        return { url: response.url, data: response.data || null, errors: response.errors };
    }
    async getInstallabilityErrors() {
        const response = await this.agent.invoke_getInstallabilityErrors();
        return response.installabilityErrors || [];
    }
    async getManifestIcons() {
        const response = await this.agent.invoke_getManifestIcons();
        return { primaryIcon: response.primaryIcon || null };
    }
    async getAppId() {
        return this.agent.invoke_getAppId();
    }
    executionContextComparator(a, b) {
        function framePath(frame) {
            let currentFrame = frame;
            const parents = [];
            while (currentFrame) {
                parents.push(currentFrame);
                currentFrame = currentFrame.sameTargetParentFrame();
            }
            return parents.reverse();
        }
        if (a.target() !== b.target()) {
            return ExecutionContext.comparator(a, b);
        }
        const framesA = a.frameId ? framePath(this.frameForId(a.frameId)) : [];
        const framesB = b.frameId ? framePath(this.frameForId(b.frameId)) : [];
        let frameA;
        let frameB;
        for (let i = 0;; i++) {
            if (!framesA[i] || !framesB[i] || (framesA[i] !== framesB[i])) {
                frameA = framesA[i];
                frameB = framesB[i];
                break;
            }
        }
        if (!frameA && frameB) {
            return -1;
        }
        if (!frameB && frameA) {
            return 1;
        }
        if (frameA && frameB) {
            return frameA.id.localeCompare(frameB.id);
        }
        return ExecutionContext.comparator(a, b);
    }
    getSecurityOriginData() {
        const securityOrigins = new Set();
        let mainSecurityOrigin = null;
        let unreachableMainSecurityOrigin = null;
        for (const frame of this.framesInternal.values()) {
            const origin = frame.securityOrigin;
            if (!origin) {
                continue;
            }
            securityOrigins.add(origin);
            if (frame.isMainFrame()) {
                mainSecurityOrigin = origin;
                if (frame.unreachableUrl()) {
                    const unreachableParsed = new Common.ParsedURL.ParsedURL(frame.unreachableUrl());
                    unreachableMainSecurityOrigin = unreachableParsed.securityOrigin();
                }
            }
        }
        return {
            securityOrigins: securityOrigins,
            mainSecurityOrigin: mainSecurityOrigin,
            unreachableMainSecurityOrigin: unreachableMainSecurityOrigin,
        };
    }
    async getStorageKeyData() {
        const storageKeys = new Set();
        let mainStorageKey = null;
        for (const { isMainFrame, storageKey } of await Promise.all([...this.framesInternal.values()].map(async (f) => f.storageKey.then(k => ({
            isMainFrame: f.isMainFrame(),
            storageKey: k,
        }))))) {
            if (isMainFrame) {
                mainStorageKey = storageKey;
            }
            if (storageKey) {
                storageKeys.add(storageKey);
            }
        }
        return { storageKeys: storageKeys, mainStorageKey: mainStorageKey };
    }
    updateSecurityOrigins() {
        const data = this.getSecurityOriginData();
        this.#securityOriginManager.setMainSecurityOrigin(data.mainSecurityOrigin || '', data.unreachableMainSecurityOrigin || '');
        this.#securityOriginManager.updateSecurityOrigins(data.securityOrigins);
    }
    async updateStorageKeys() {
        const data = await this.getStorageKeyData();
        this.#storageKeyManager.setMainStorageKey(data.mainStorageKey || '');
        this.#storageKeyManager.updateStorageKeys(data.storageKeys);
    }
    async getMainStorageKey() {
        return this.mainFrame ? this.mainFrame.storageKey : null;
    }
    getMainSecurityOrigin() {
        const data = this.getSecurityOriginData();
        return data.mainSecurityOrigin || data.unreachableMainSecurityOrigin;
    }
    onBackForwardCacheNotUsed(event) {
        if (this.mainFrame && this.mainFrame.id === event.frameId && this.mainFrame.loaderId === event.loaderId) {
            this.mainFrame.setBackForwardCacheDetails(event);
            this.dispatchEventToListeners(Events.BackForwardCacheDetailsUpdated, this.mainFrame);
        }
        else {
            this.#pendingBackForwardCacheNotUsedEvents.add(event);
        }
    }
    onPrerenderAttemptCompleted(event) {
        if (this.mainFrame && this.mainFrame.id === event.initiatingFrameId) {
            this.mainFrame.setPrerenderFinalStatus(event.finalStatus);
            this.dispatchEventToListeners(Events.PrerenderingStatusUpdated, this.mainFrame);
        }
        else {
            this.#pendingPrerenderAttemptCompletedEvents.add(event);
        }
    }
    processPendingEvents(frame) {
        if (!frame.isMainFrame()) {
            return;
        }
        for (const event of this.#pendingBackForwardCacheNotUsedEvents) {
            if (frame.id === event.frameId && frame.loaderId === event.loaderId) {
                frame.setBackForwardCacheDetails(event);
                this.#pendingBackForwardCacheNotUsedEvents.delete(event);
                break;
            }
        }
        for (const event of this.#pendingPrerenderAttemptCompletedEvents) {
            if (frame.id === event.initiatingFrameId) {
                frame.setPrerenderFinalStatus(event.finalStatus);
                this.#pendingPrerenderAttemptCompletedEvents.delete(event);
                break;
            }
        }
        // No need to dispatch events here as this method call is followed by a `MainFrameNavigated` event.
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["FrameAdded"] = "FrameAdded";
    Events["FrameNavigated"] = "FrameNavigated";
    Events["FrameDetached"] = "FrameDetached";
    Events["FrameResized"] = "FrameResized";
    Events["FrameWillNavigate"] = "FrameWillNavigate";
    Events["MainFrameNavigated"] = "MainFrameNavigated";
    Events["ResourceAdded"] = "ResourceAdded";
    Events["WillLoadCachedResources"] = "WillLoadCachedResources";
    Events["CachedResourcesLoaded"] = "CachedResourcesLoaded";
    Events["DOMContentLoaded"] = "DOMContentLoaded";
    Events["LifecycleEvent"] = "LifecycleEvent";
    Events["Load"] = "Load";
    Events["PageReloadRequested"] = "PageReloadRequested";
    Events["WillReloadPage"] = "WillReloadPage";
    Events["InterstitialShown"] = "InterstitialShown";
    Events["InterstitialHidden"] = "InterstitialHidden";
    Events["BackForwardCacheDetailsUpdated"] = "BackForwardCacheDetailsUpdated";
    Events["PrerenderingStatusUpdated"] = "PrerenderingStatusUpdated";
})(Events || (Events = {}));
export class ResourceTreeFrame {
    #model;
    #sameTargetParentFrameInternal;
    #idInternal;
    crossTargetParentFrameId;
    #loaderIdInternal;
    #nameInternal;
    #urlInternal;
    #domainAndRegistryInternal;
    #securityOriginInternal;
    #storageKeyInternal;
    #unreachableUrlInternal;
    #adFrameStatusInternal;
    #secureContextType;
    #crossOriginIsolatedContextType;
    #gatedAPIFeatures;
    #creationStackTrace;
    #creationStackTraceTarget;
    #childFramesInternal;
    #adScriptId;
    #debuggerId;
    resourcesMap;
    backForwardCacheDetails = {
        restoredFromCache: undefined,
        explanations: [],
        explanationsTree: undefined,
    };
    prerenderFinalStatus;
    constructor(model, parentFrame, frameId, payload, creationStackTrace, adScriptId) {
        this.#model = model;
        this.#sameTargetParentFrameInternal = parentFrame;
        this.#idInternal = frameId;
        this.crossTargetParentFrameId = null;
        this.#loaderIdInternal = (payload && payload.loaderId) || '';
        this.#nameInternal = payload && payload.name;
        this.#urlInternal =
            payload && payload.url || Platform.DevToolsPath.EmptyUrlString;
        this.#domainAndRegistryInternal = (payload && payload.domainAndRegistry) || '';
        this.#securityOriginInternal = payload && payload.securityOrigin;
        this.#unreachableUrlInternal =
            (payload && payload.unreachableUrl) || Platform.DevToolsPath.EmptyUrlString;
        this.#adFrameStatusInternal = payload?.adFrameStatus;
        this.#secureContextType = payload && payload.secureContextType;
        this.#crossOriginIsolatedContextType = payload && payload.crossOriginIsolatedContextType;
        this.#gatedAPIFeatures = payload && payload.gatedAPIFeatures;
        this.#creationStackTrace = creationStackTrace;
        this.#creationStackTraceTarget = null;
        this.#adScriptId = adScriptId?.scriptId || null;
        this.#debuggerId = adScriptId?.debuggerId || null;
        this.#childFramesInternal = new Set();
        this.resourcesMap = new Map();
        this.prerenderFinalStatus = null;
        if (this.#sameTargetParentFrameInternal) {
            this.#sameTargetParentFrameInternal.#childFramesInternal.add(this);
        }
    }
    isSecureContext() {
        return this.#secureContextType !== null && this.#secureContextType.startsWith('Secure');
    }
    getSecureContextType() {
        return this.#secureContextType;
    }
    isCrossOriginIsolated() {
        return this.#crossOriginIsolatedContextType !== null && this.#crossOriginIsolatedContextType.startsWith('Isolated');
    }
    getCrossOriginIsolatedContextType() {
        return this.#crossOriginIsolatedContextType;
    }
    getGatedAPIFeatures() {
        return this.#gatedAPIFeatures;
    }
    getCreationStackTraceData() {
        return {
            creationStackTrace: this.#creationStackTrace,
            creationStackTraceTarget: this.#creationStackTraceTarget || this.resourceTreeModel().target(),
        };
    }
    navigate(framePayload) {
        this.#loaderIdInternal = framePayload.loaderId;
        this.#nameInternal = framePayload.name;
        this.#urlInternal = framePayload.url;
        this.#domainAndRegistryInternal = framePayload.domainAndRegistry;
        this.#securityOriginInternal = framePayload.securityOrigin;
        this.#unreachableUrlInternal =
            framePayload.unreachableUrl || Platform.DevToolsPath.EmptyUrlString;
        this.#adFrameStatusInternal = framePayload?.adFrameStatus;
        this.#secureContextType = framePayload.secureContextType;
        this.#crossOriginIsolatedContextType = framePayload.crossOriginIsolatedContextType;
        this.#gatedAPIFeatures = framePayload.gatedAPIFeatures;
        this.backForwardCacheDetails = {
            restoredFromCache: undefined,
            explanations: [],
            explanationsTree: undefined,
        };
        const mainResource = this.resourcesMap.get(this.#urlInternal);
        this.resourcesMap.clear();
        this.removeChildFrames();
        if (mainResource && mainResource.loaderId === this.#loaderIdInternal) {
            this.addResource(mainResource);
        }
    }
    resourceTreeModel() {
        return this.#model;
    }
    get id() {
        return this.#idInternal;
    }
    get name() {
        return this.#nameInternal || '';
    }
    get url() {
        return this.#urlInternal;
    }
    domainAndRegistry() {
        return this.#domainAndRegistryInternal;
    }
    getAdScriptId() {
        return this.#adScriptId;
    }
    setAdScriptId(adScriptId) {
        this.#adScriptId = adScriptId;
    }
    getDebuggerId() {
        return this.#debuggerId;
    }
    setDebuggerId(debuggerId) {
        this.#debuggerId = debuggerId;
    }
    get securityOrigin() {
        return this.#securityOriginInternal;
    }
    get storageKey() {
        if (!this.#storageKeyInternal) {
            this.#storageKeyInternal = this.#model.storageKeyForFrame(this.#idInternal);
        }
        return this.#storageKeyInternal;
    }
    unreachableUrl() {
        return this.#unreachableUrlInternal;
    }
    get loaderId() {
        return this.#loaderIdInternal;
    }
    adFrameType() {
        return this.#adFrameStatusInternal?.adFrameType || "none" /* None */;
    }
    adFrameStatus() {
        return this.#adFrameStatusInternal;
    }
    get childFrames() {
        return [...this.#childFramesInternal];
    }
    /**
     * Returns the parent frame if both #frames are part of the same process/target.
     */
    sameTargetParentFrame() {
        return this.#sameTargetParentFrameInternal;
    }
    /**
     * Returns the parent frame if both #frames are part of different processes/targets (child is an OOPIF).
     */
    crossTargetParentFrame() {
        if (!this.crossTargetParentFrameId) {
            return null;
        }
        const parentTarget = this.#model.target().parentTarget();
        if (!parentTarget) {
            return null;
        }
        const parentModel = parentTarget.model(ResourceTreeModel);
        if (!parentModel) {
            return null;
        }
        // Note that parent #model has already processed cached resources:
        // - when parent target was created, we issued getResourceTree call;
        // - strictly after we issued setAutoAttach call;
        // - both of them were handled in renderer in the same order;
        // - cached resource tree got processed on parent #model;
        // - child target was created as a result of setAutoAttach call.
        return parentModel.framesInternal.get(this.crossTargetParentFrameId) || null;
    }
    /**
     * Returns the parent frame. There is only 1 parent and it's either in the
     * same target or it's cross-target.
     */
    parentFrame() {
        return this.sameTargetParentFrame() || this.crossTargetParentFrame();
    }
    /**
     * Returns true if this is the main frame of its target. For example, this returns true for the main frame
     * of an out-of-process iframe (OOPIF).
     */
    isMainFrame() {
        return !this.#sameTargetParentFrameInternal;
    }
    /**
     * Returns true if this is the top frame of the main target, i.e. if this is the top-most frame in the inspected
     * tab.
     */
    isTopFrame() {
        return !this.#model.target().parentTarget() && !this.#sameTargetParentFrameInternal &&
            !this.crossTargetParentFrameId;
    }
    removeChildFrame(frame, isSwap) {
        this.#childFramesInternal.delete(frame);
        frame.remove(isSwap);
    }
    removeChildFrames() {
        const frames = this.#childFramesInternal;
        this.#childFramesInternal = new Set();
        for (const frame of frames) {
            frame.remove(false);
        }
    }
    remove(isSwap) {
        this.removeChildFrames();
        this.#model.framesInternal.delete(this.id);
        this.#model.dispatchEventToListeners(Events.FrameDetached, { frame: this, isSwap });
    }
    addResource(resource) {
        if (this.resourcesMap.get(resource.url) === resource) {
            // Already in the tree, we just got an extra update.
            return;
        }
        this.resourcesMap.set(resource.url, resource);
        this.#model.dispatchEventToListeners(Events.ResourceAdded, resource);
    }
    addRequest(request) {
        let resource = this.resourcesMap.get(request.url());
        if (resource && resource.request === request) {
            // Already in the tree, we just got an extra update.
            return;
        }
        resource = new Resource(this.#model, request, request.url(), request.documentURL, request.frameId, request.loaderId, request.resourceType(), request.mimeType, null, null);
        this.resourcesMap.set(resource.url, resource);
        this.#model.dispatchEventToListeners(Events.ResourceAdded, resource);
    }
    resources() {
        return Array.from(this.resourcesMap.values());
    }
    resourceForURL(url) {
        const resource = this.resourcesMap.get(url);
        if (resource) {
            return resource;
        }
        for (const frame of this.#childFramesInternal) {
            const resource = frame.resourceForURL(url);
            if (resource) {
                return resource;
            }
        }
        return null;
    }
    callForFrameResources(callback) {
        for (const resource of this.resourcesMap.values()) {
            if (callback(resource)) {
                return true;
            }
        }
        for (const frame of this.#childFramesInternal) {
            if (frame.callForFrameResources(callback)) {
                return true;
            }
        }
        return false;
    }
    displayName() {
        if (this.isTopFrame()) {
            return i18n.i18n.lockedString('top');
        }
        const subtitle = new Common.ParsedURL.ParsedURL(this.#urlInternal).displayName;
        if (subtitle) {
            if (!this.#nameInternal) {
                return subtitle;
            }
            return this.#nameInternal + ' (' + subtitle + ')';
        }
        return i18n.i18n.lockedString('iframe');
    }
    async getOwnerDeferredDOMNode() {
        const parentFrame = this.parentFrame();
        if (!parentFrame) {
            return null;
        }
        return parentFrame.resourceTreeModel().domModel().getOwnerNodeForFrame(this.#idInternal);
    }
    async getOwnerDOMNodeOrDocument() {
        const deferredNode = await this.getOwnerDeferredDOMNode();
        if (deferredNode) {
            return deferredNode.resolvePromise();
        }
        if (this.isTopFrame()) {
            return this.resourceTreeModel().domModel().requestDocument();
        }
        return null;
    }
    async highlight() {
        const parentFrame = this.parentFrame();
        const parentTarget = this.resourceTreeModel().target().parentTarget();
        const highlightFrameOwner = async (domModel) => {
            const deferredNode = await domModel.getOwnerNodeForFrame(this.#idInternal);
            if (deferredNode) {
                domModel.overlayModel().highlightInOverlay({ deferredNode, selectorList: '' }, 'all', true);
            }
        };
        if (parentFrame) {
            return highlightFrameOwner(parentFrame.resourceTreeModel().domModel());
        }
        // Portals.
        if (parentTarget) {
            const domModel = parentTarget.model(DOMModel);
            if (domModel) {
                return highlightFrameOwner(domModel);
            }
        }
        // For the top frame there is no owner node. Highlight the whole #document instead.
        const document = await this.resourceTreeModel().domModel().requestDocument();
        if (document) {
            this.resourceTreeModel().domModel().overlayModel().highlightInOverlay({ node: document, selectorList: '' }, 'all', true);
        }
    }
    async getPermissionsPolicyState() {
        const response = await this.resourceTreeModel().target().pageAgent().invoke_getPermissionsPolicyState({ frameId: this.#idInternal });
        if (response.getError()) {
            return null;
        }
        return response.states;
    }
    async getOriginTrials() {
        const response = await this.resourceTreeModel().target().pageAgent().invoke_getOriginTrials({ frameId: this.#idInternal });
        if (response.getError()) {
            return [];
        }
        return response.originTrials;
    }
    setCreationStackTrace(creationStackTraceData) {
        this.#creationStackTrace = creationStackTraceData.creationStackTrace;
        this.#creationStackTraceTarget = creationStackTraceData.creationStackTraceTarget;
    }
    setBackForwardCacheDetails(event) {
        this.backForwardCacheDetails.restoredFromCache = false;
        this.backForwardCacheDetails.explanations = event.notRestoredExplanations;
        this.backForwardCacheDetails.explanationsTree = event.notRestoredExplanationsTree;
    }
    getResourcesMap() {
        return this.resourcesMap;
    }
    setPrerenderFinalStatus(status) {
        this.prerenderFinalStatus = status;
    }
}
export class PageDispatcher {
    #resourceTreeModel;
    constructor(resourceTreeModel) {
        this.#resourceTreeModel = resourceTreeModel;
    }
    backForwardCacheNotUsed(params) {
        this.#resourceTreeModel.onBackForwardCacheNotUsed(params);
    }
    domContentEventFired({ timestamp }) {
        this.#resourceTreeModel.dispatchEventToListeners(Events.DOMContentLoaded, timestamp);
    }
    loadEventFired({ timestamp }) {
        this.#resourceTreeModel.dispatchEventToListeners(Events.Load, { resourceTreeModel: this.#resourceTreeModel, loadTime: timestamp });
    }
    lifecycleEvent({ frameId, name }) {
        this.#resourceTreeModel.dispatchEventToListeners(Events.LifecycleEvent, { frameId, name });
    }
    frameAttached({ frameId, parentFrameId, stack, adScriptId }) {
        this.#resourceTreeModel.frameAttached(frameId, parentFrameId, stack, adScriptId);
    }
    frameNavigated({ frame, type }) {
        this.#resourceTreeModel.frameNavigated(frame, type);
    }
    documentOpened({ frame }) {
        this.#resourceTreeModel.documentOpened(frame);
    }
    frameDetached({ frameId, reason }) {
        this.#resourceTreeModel.frameDetached(frameId, reason === "swap" /* Swap */);
    }
    frameStartedLoading({}) {
    }
    frameStoppedLoading({}) {
    }
    frameRequestedNavigation({}) {
    }
    frameScheduledNavigation({}) {
    }
    frameClearedScheduledNavigation({}) {
    }
    navigatedWithinDocument({}) {
    }
    frameResized() {
        this.#resourceTreeModel.dispatchEventToListeners(Events.FrameResized);
    }
    javascriptDialogOpening({ hasBrowserHandler }) {
        if (!hasBrowserHandler) {
            void this.#resourceTreeModel.agent.invoke_handleJavaScriptDialog({ accept: false });
        }
    }
    javascriptDialogClosed({}) {
    }
    screencastFrame({}) {
    }
    screencastVisibilityChanged({}) {
    }
    interstitialShown() {
        this.#resourceTreeModel.isInterstitialShowing = true;
        this.#resourceTreeModel.dispatchEventToListeners(Events.InterstitialShown);
    }
    interstitialHidden() {
        this.#resourceTreeModel.isInterstitialShowing = false;
        this.#resourceTreeModel.dispatchEventToListeners(Events.InterstitialHidden);
    }
    windowOpen({}) {
    }
    compilationCacheProduced({}) {
    }
    fileChooserOpened({}) {
    }
    downloadWillBegin({}) {
    }
    downloadProgress() {
    }
    prerenderAttemptCompleted(params) {
        this.#resourceTreeModel.onPrerenderAttemptCompleted(params);
    }
}
SDKModel.register(ResourceTreeModel, { capabilities: Capability.DOM, autostart: true, early: true });
//# sourceMappingURL=ResourceTreeModel.js.map
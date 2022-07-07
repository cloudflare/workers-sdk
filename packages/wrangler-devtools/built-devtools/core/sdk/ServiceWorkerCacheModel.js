// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as i18n from '../i18n/i18n.js';
import { Capability } from './Target.js';
import { SDKModel } from './SDKModel.js';
import { Events as SecurityOriginManagerEvents, SecurityOriginManager } from './SecurityOriginManager.js';
const UIStrings = {
    /**
    *@description Text in Service Worker Cache Model
    *@example {https://cache} PH1
    *@example {error message} PH2
    */
    serviceworkercacheagentError: '`ServiceWorkerCacheAgent` error deleting cache entry {PH1} in cache: {PH2}',
};
const str_ = i18n.i18n.registerUIStrings('core/sdk/ServiceWorkerCacheModel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class ServiceWorkerCacheModel extends SDKModel {
    cacheAgent;
    #storageAgent;
    #securityOriginManager;
    #cachesInternal = new Map();
    #originsUpdated = new Set();
    #throttler = new Common.Throttler.Throttler(2000);
    #enabled = false;
    // Used by tests to remove the Throttler timeout.
    #scheduleAsSoonAsPossible = false;
    /**
     * Invariant: This #model can only be constructed on a ServiceWorker target.
     */
    constructor(target) {
        super(target);
        target.registerStorageDispatcher(this);
        this.cacheAgent = target.cacheStorageAgent();
        this.#storageAgent = target.storageAgent();
        this.#securityOriginManager = target.model(SecurityOriginManager);
    }
    enable() {
        if (this.#enabled) {
            return;
        }
        this.#securityOriginManager.addEventListener(SecurityOriginManagerEvents.SecurityOriginAdded, this.securityOriginAdded, this);
        this.#securityOriginManager.addEventListener(SecurityOriginManagerEvents.SecurityOriginRemoved, this.securityOriginRemoved, this);
        for (const securityOrigin of this.#securityOriginManager.securityOrigins()) {
            this.addOrigin(securityOrigin);
        }
        this.#enabled = true;
    }
    clearForOrigin(origin) {
        this.removeOrigin(origin);
        this.addOrigin(origin);
    }
    refreshCacheNames() {
        for (const cache of this.#cachesInternal.values()) {
            this.cacheRemoved(cache);
        }
        this.#cachesInternal.clear();
        const securityOrigins = this.#securityOriginManager.securityOrigins();
        for (const securityOrigin of securityOrigins) {
            void this.loadCacheNames(securityOrigin);
        }
    }
    async deleteCache(cache) {
        const response = await this.cacheAgent.invoke_deleteCache({ cacheId: cache.cacheId });
        if (response.getError()) {
            console.error(`ServiceWorkerCacheAgent error deleting cache ${cache.toString()}: ${response.getError()}`);
            return;
        }
        this.#cachesInternal.delete(cache.cacheId);
        this.cacheRemoved(cache);
    }
    async deleteCacheEntry(cache, request) {
        const response = await this.cacheAgent.invoke_deleteEntry({ cacheId: cache.cacheId, request });
        if (response.getError()) {
            Common.Console.Console.instance().error(i18nString(UIStrings.serviceworkercacheagentError, { PH1: cache.toString(), PH2: String(response.getError()) }));
            return;
        }
    }
    loadCacheData(cache, skipCount, pageSize, pathFilter, callback) {
        void this.requestEntries(cache, skipCount, pageSize, pathFilter, callback);
    }
    loadAllCacheData(cache, pathFilter, callback) {
        void this.requestAllEntries(cache, pathFilter, callback);
    }
    caches() {
        const caches = new Array();
        for (const cache of this.#cachesInternal.values()) {
            caches.push(cache);
        }
        return caches;
    }
    dispose() {
        for (const cache of this.#cachesInternal.values()) {
            this.cacheRemoved(cache);
        }
        this.#cachesInternal.clear();
        if (this.#enabled) {
            this.#securityOriginManager.removeEventListener(SecurityOriginManagerEvents.SecurityOriginAdded, this.securityOriginAdded, this);
            this.#securityOriginManager.removeEventListener(SecurityOriginManagerEvents.SecurityOriginRemoved, this.securityOriginRemoved, this);
        }
    }
    addOrigin(securityOrigin) {
        void this.loadCacheNames(securityOrigin);
        if (this.isValidSecurityOrigin(securityOrigin)) {
            void this.#storageAgent.invoke_trackCacheStorageForOrigin({ origin: securityOrigin });
        }
    }
    removeOrigin(securityOrigin) {
        for (const [opaqueId, cache] of this.#cachesInternal.entries()) {
            if (cache.securityOrigin === securityOrigin) {
                this.#cachesInternal.delete(opaqueId);
                this.cacheRemoved(cache);
            }
        }
        if (this.isValidSecurityOrigin(securityOrigin)) {
            void this.#storageAgent.invoke_untrackCacheStorageForOrigin({ origin: securityOrigin });
        }
    }
    isValidSecurityOrigin(securityOrigin) {
        const parsedURL = Common.ParsedURL.ParsedURL.fromString(securityOrigin);
        return parsedURL !== null && parsedURL.scheme.startsWith('http');
    }
    async loadCacheNames(securityOrigin) {
        const response = await this.cacheAgent.invoke_requestCacheNames({ securityOrigin: securityOrigin });
        if (response.getError()) {
            return;
        }
        this.updateCacheNames(securityOrigin, response.caches);
    }
    updateCacheNames(securityOrigin, cachesJson) {
        function deleteAndSaveOldCaches(cache) {
            if (cache.securityOrigin === securityOrigin && !updatingCachesIds.has(cache.cacheId)) {
                oldCaches.set(cache.cacheId, cache);
                this.#cachesInternal.delete(cache.cacheId);
            }
        }
        const updatingCachesIds = new Set();
        const newCaches = new Map();
        const oldCaches = new Map();
        for (const cacheJson of cachesJson) {
            const cache = new Cache(this, cacheJson.securityOrigin, cacheJson.cacheName, cacheJson.cacheId);
            updatingCachesIds.add(cache.cacheId);
            if (this.#cachesInternal.has(cache.cacheId)) {
                continue;
            }
            newCaches.set(cache.cacheId, cache);
            this.#cachesInternal.set(cache.cacheId, cache);
        }
        this.#cachesInternal.forEach(deleteAndSaveOldCaches, this);
        newCaches.forEach(this.cacheAdded, this);
        oldCaches.forEach(this.cacheRemoved, this);
    }
    securityOriginAdded(event) {
        this.addOrigin(event.data);
    }
    securityOriginRemoved(event) {
        this.removeOrigin(event.data);
    }
    cacheAdded(cache) {
        this.dispatchEventToListeners(Events.CacheAdded, { model: this, cache: cache });
    }
    cacheRemoved(cache) {
        this.dispatchEventToListeners(Events.CacheRemoved, { model: this, cache: cache });
    }
    async requestEntries(cache, skipCount, pageSize, pathFilter, callback) {
        const response = await this.cacheAgent.invoke_requestEntries({ cacheId: cache.cacheId, skipCount, pageSize, pathFilter });
        if (response.getError()) {
            console.error('ServiceWorkerCacheAgent error while requesting entries: ', response.getError());
            return;
        }
        callback(response.cacheDataEntries, response.returnCount);
    }
    async requestAllEntries(cache, pathFilter, callback) {
        const response = await this.cacheAgent.invoke_requestEntries({ cacheId: cache.cacheId, pathFilter });
        if (response.getError()) {
            console.error('ServiceWorkerCacheAgent error while requesting entries: ', response.getError());
            return;
        }
        callback(response.cacheDataEntries, response.returnCount);
    }
    cacheStorageListUpdated({ origin }) {
        this.#originsUpdated.add(origin);
        void this.#throttler.schedule(() => {
            const promises = Array.from(this.#originsUpdated, origin => this.loadCacheNames(origin));
            this.#originsUpdated.clear();
            return Promise.all(promises);
        }, this.#scheduleAsSoonAsPossible);
    }
    cacheStorageContentUpdated({ origin, cacheName }) {
        this.dispatchEventToListeners(Events.CacheStorageContentUpdated, { origin, cacheName });
    }
    indexedDBListUpdated(_event) {
    }
    indexedDBContentUpdated(_event) {
    }
    interestGroupAccessed(_event) {
    }
    setThrottlerSchedulesAsSoonAsPossibleForTest() {
        this.#scheduleAsSoonAsPossible = true;
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["CacheAdded"] = "CacheAdded";
    Events["CacheRemoved"] = "CacheRemoved";
    Events["CacheStorageContentUpdated"] = "CacheStorageContentUpdated";
})(Events || (Events = {}));
export class Cache {
    #model;
    securityOrigin;
    cacheName;
    cacheId;
    constructor(model, securityOrigin, cacheName, cacheId) {
        this.#model = model;
        this.securityOrigin = securityOrigin;
        this.cacheName = cacheName;
        this.cacheId = cacheId;
    }
    equals(cache) {
        return this.cacheId === cache.cacheId;
    }
    toString() {
        return this.securityOrigin + this.cacheName;
    }
    async requestCachedResponse(url, requestHeaders) {
        const response = await this.#model.cacheAgent.invoke_requestCachedResponse({ cacheId: this.cacheId, requestURL: url, requestHeaders });
        if (response.getError()) {
            return null;
        }
        return response.response;
    }
}
SDKModel.register(ServiceWorkerCacheModel, { capabilities: Capability.Storage, autostart: false });
//# sourceMappingURL=ServiceWorkerCacheModel.js.map
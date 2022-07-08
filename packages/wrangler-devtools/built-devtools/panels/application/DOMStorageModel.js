// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2008 Nokia Inc.  All rights reserved.
 * Copyright (C) 2013 Samsung Electronics. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
export class DOMStorage extends Common.ObjectWrapper.ObjectWrapper {
    model;
    securityOriginInternal;
    storageKeyInternal;
    isLocalStorageInternal;
    constructor(model, securityOrigin, storageKey, isLocalStorage) {
        super();
        this.model = model;
        this.securityOriginInternal = securityOrigin;
        this.storageKeyInternal = storageKey;
        this.isLocalStorageInternal = isLocalStorage;
    }
    static storageId(securityOrigin, isLocalStorage) {
        return { securityOrigin: securityOrigin, isLocalStorage: isLocalStorage };
    }
    static storageIdWithSecurityOrigin(securityOrigin, isLocalStorage) {
        return { securityOrigin: securityOrigin, isLocalStorage: isLocalStorage };
    }
    static storageIdWithStorageKey(storageKey, isLocalStorage) {
        return { storageKey: storageKey, isLocalStorage: isLocalStorage };
    }
    get idWithSecurityOrigin() {
        let securityOrigin = '';
        if (this.securityOriginInternal) {
            securityOrigin = this.securityOriginInternal;
        }
        return DOMStorage.storageIdWithSecurityOrigin(securityOrigin, this.isLocalStorageInternal);
    }
    get idWithStorageKey() {
        let storageKey = '';
        if (this.storageKeyInternal) {
            storageKey = this.storageKeyInternal;
        }
        return DOMStorage.storageIdWithStorageKey(storageKey, this.isLocalStorageInternal);
    }
    get id() {
        // TODO(crbug.com/1313434) Prioritize storageKey once everything is ready
        if (this.securityOriginInternal) {
            return this.idWithSecurityOrigin;
        }
        return this.idWithStorageKey;
    }
    get securityOrigin() {
        return this.securityOriginInternal;
    }
    get storageKey() {
        return this.storageKeyInternal;
    }
    get isLocalStorage() {
        return this.isLocalStorageInternal;
    }
    getItems() {
        return this.model.agent.invoke_getDOMStorageItems({ storageId: this.id }).then(({ entries }) => entries);
    }
    setItem(key, value) {
        void this.model.agent.invoke_setDOMStorageItem({ storageId: this.id, key, value });
    }
    removeItem(key) {
        void this.model.agent.invoke_removeDOMStorageItem({ storageId: this.id, key });
    }
    clear() {
        void this.model.agent.invoke_clear({ storageId: this.id });
    }
}
(function (DOMStorage) {
    // TODO(crbug.com/1167717): Make this a const enum again
    // eslint-disable-next-line rulesdir/const_enum
    let Events;
    (function (Events) {
        Events["DOMStorageItemsCleared"] = "DOMStorageItemsCleared";
        Events["DOMStorageItemRemoved"] = "DOMStorageItemRemoved";
        Events["DOMStorageItemAdded"] = "DOMStorageItemAdded";
        Events["DOMStorageItemUpdated"] = "DOMStorageItemUpdated";
    })(Events = DOMStorage.Events || (DOMStorage.Events = {}));
})(DOMStorage || (DOMStorage = {}));
export class DOMStorageModel extends SDK.SDKModel.SDKModel {
    securityOriginManager;
    storageKeyManagerInternal;
    storagesInternal;
    agent;
    enabled;
    constructor(target) {
        super(target);
        this.securityOriginManager = target.model(SDK.SecurityOriginManager.SecurityOriginManager);
        this.storageKeyManagerInternal = target.model(SDK.StorageKeyManager.StorageKeyManager);
        this.storagesInternal = {};
        this.agent = target.domstorageAgent();
    }
    get storageKeyManagerForTest() {
        return this.storageKeyManagerInternal;
    }
    enable() {
        if (this.enabled) {
            return;
        }
        this.target().registerDOMStorageDispatcher(new DOMStorageDispatcher(this));
        if (this.securityOriginManager) {
            this.securityOriginManager.addEventListener(SDK.SecurityOriginManager.Events.SecurityOriginAdded, this.securityOriginAdded, this);
            this.securityOriginManager.addEventListener(SDK.SecurityOriginManager.Events.SecurityOriginRemoved, this.securityOriginRemoved, this);
            for (const securityOrigin of this.securityOriginManager.securityOrigins()) {
                this.addOrigin(securityOrigin);
            }
        }
        if (this.storageKeyManagerInternal) {
            this.storageKeyManagerInternal.addEventListener(SDK.StorageKeyManager.Events.StorageKeyAdded, this.storageKeyAdded, this);
            this.storageKeyManagerInternal.addEventListener(SDK.StorageKeyManager.Events.StorageKeyRemoved, this.storageKeyRemoved, this);
            for (const storageKey of this.storageKeyManagerInternal.storageKeys()) {
                this.addStorageKey(storageKey);
            }
        }
        void this.agent.invoke_enable();
        this.enabled = true;
    }
    clearForOrigin(origin) {
        if (!this.enabled) {
            return;
        }
        for (const isLocal of [true, false]) {
            const key = this.keyForSecurityOrigin(origin, isLocal);
            const storage = this.storagesInternal[key];
            if (!storage) {
                return;
            }
            storage.clear();
        }
        this.removeOrigin(origin);
        this.addOrigin(origin);
    }
    clearForStorageKey(storageKey) {
        if (!this.enabled) {
            return;
        }
        for (const isLocal of [true, false]) {
            const key = this.keyForStorageKey(storageKey, isLocal);
            const storage = this.storagesInternal[key];
            if (!storage) {
                return;
            }
            storage.clear();
        }
        this.removeStorageKey(storageKey);
        this.addStorageKey(storageKey);
    }
    securityOriginAdded(event) {
        this.addOrigin(event.data);
    }
    storageKeyAdded(event) {
        this.addStorageKey(event.data);
    }
    addOrigin(securityOrigin) {
        const parsed = new Common.ParsedURL.ParsedURL(securityOrigin);
        // These are "opaque" origins which are not supposed to support DOM storage.
        if (!parsed.isValid || parsed.scheme === 'data' || parsed.scheme === 'about' || parsed.scheme === 'javascript') {
            return;
        }
        for (const isLocal of [true, false]) {
            const key = this.keyForSecurityOrigin(securityOrigin, isLocal);
            console.assert(!this.storagesInternal[key]);
            if (this.duplicateExists(key)) {
                continue;
            }
            const storage = new DOMStorage(this, securityOrigin, '', isLocal);
            this.storagesInternal[key] = storage;
            this.dispatchEventToListeners(Events.DOMStorageAdded, storage);
        }
    }
    addStorageKey(storageKey) {
        for (const isLocal of [true, false]) {
            const key = this.keyForStorageKey(storageKey, isLocal);
            console.assert(!this.storagesInternal[key]);
            if (this.duplicateExists(key)) {
                continue;
            }
            const storage = new DOMStorage(this, '', storageKey, isLocal);
            this.storagesInternal[key] = storage;
            this.dispatchEventToListeners(Events.DOMStorageAdded, storage);
        }
    }
    duplicateExists(key) {
        const parsedKey = JSON.parse(key);
        for (const storageInternal in this.storagesInternal) {
            const parsedStorageInternalKey = JSON.parse(storageInternal);
            if (parsedKey.isLocalStorage === parsedStorageInternalKey.isLocalStorage) {
                if (parsedKey.storageKey?.slice(0, -1) === parsedStorageInternalKey.securityOrigin ||
                    parsedKey.securityOrigin === parsedStorageInternalKey.storageKey?.slice(0, -1)) {
                    return true;
                }
            }
        }
        return false;
    }
    securityOriginRemoved(event) {
        this.removeOrigin(event.data);
    }
    storageKeyRemoved(event) {
        this.removeStorageKey(event.data);
    }
    removeOrigin(securityOrigin) {
        for (const isLocal of [true, false]) {
            const key = this.keyForSecurityOrigin(securityOrigin, isLocal);
            const storage = this.storagesInternal[key];
            if (!storage) {
                continue;
            }
            delete this.storagesInternal[key];
            this.dispatchEventToListeners(Events.DOMStorageRemoved, storage);
        }
    }
    removeStorageKey(storageKey) {
        for (const isLocal of [true, false]) {
            const key = this.keyForStorageKey(storageKey, isLocal);
            const storage = this.storagesInternal[key];
            if (!storage) {
                continue;
            }
            delete this.storagesInternal[key];
            this.dispatchEventToListeners(Events.DOMStorageRemoved, storage);
        }
    }
    storageKey(securityOrigin, storageKey, isLocalStorage) {
        // TODO(crbug.com/1313434) Prioritize storageKey once everything is ready
        console.assert(Boolean(securityOrigin) || Boolean(storageKey));
        if (securityOrigin) {
            return JSON.stringify(DOMStorage.storageIdWithSecurityOrigin(securityOrigin, isLocalStorage));
        }
        if (storageKey) {
            return JSON.stringify(DOMStorage.storageIdWithStorageKey(storageKey, isLocalStorage));
        }
        throw new Error('Either securityOrigin or storageKey is required');
    }
    keyForSecurityOrigin(securityOrigin, isLocalStorage) {
        return this.storageKey(securityOrigin, '', isLocalStorage);
    }
    keyForStorageKey(storageKey, isLocalStorage) {
        return this.storageKey('', storageKey, isLocalStorage);
    }
    domStorageItemsCleared(storageId) {
        const domStorage = this.storageForId(storageId);
        if (!domStorage) {
            return;
        }
        domStorage.dispatchEventToListeners(DOMStorage.Events.DOMStorageItemsCleared);
    }
    domStorageItemRemoved(storageId, key) {
        const domStorage = this.storageForId(storageId);
        if (!domStorage) {
            return;
        }
        const eventData = { key: key };
        domStorage.dispatchEventToListeners(DOMStorage.Events.DOMStorageItemRemoved, eventData);
    }
    domStorageItemAdded(storageId, key, value) {
        const domStorage = this.storageForId(storageId);
        if (!domStorage) {
            return;
        }
        const eventData = { key: key, value: value };
        domStorage.dispatchEventToListeners(DOMStorage.Events.DOMStorageItemAdded, eventData);
    }
    domStorageItemUpdated(storageId, key, oldValue, value) {
        const domStorage = this.storageForId(storageId);
        if (!domStorage) {
            return;
        }
        const eventData = { key: key, oldValue: oldValue, value: value };
        domStorage.dispatchEventToListeners(DOMStorage.Events.DOMStorageItemUpdated, eventData);
    }
    storageForId(storageId) {
        return this
            .storagesInternal[this.storageKey(storageId.securityOrigin, storageId.storageKey, storageId.isLocalStorage)];
    }
    storages() {
        const result = [];
        for (const id in this.storagesInternal) {
            result.push(this.storagesInternal[id]);
        }
        return result;
    }
}
SDK.SDKModel.SDKModel.register(DOMStorageModel, { capabilities: SDK.Target.Capability.DOM, autostart: false });
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["DOMStorageAdded"] = "DOMStorageAdded";
    Events["DOMStorageRemoved"] = "DOMStorageRemoved";
})(Events || (Events = {}));
export class DOMStorageDispatcher {
    model;
    constructor(model) {
        this.model = model;
    }
    domStorageItemsCleared({ storageId }) {
        this.model.domStorageItemsCleared(storageId);
    }
    domStorageItemRemoved({ storageId, key }) {
        this.model.domStorageItemRemoved(storageId, key);
    }
    domStorageItemAdded({ storageId, key, newValue }) {
        this.model.domStorageItemAdded(storageId, key, newValue);
    }
    domStorageItemUpdated({ storageId, key, oldValue, newValue }) {
        this.model.domStorageItemUpdated(storageId, key, oldValue, newValue);
    }
}
//# sourceMappingURL=DOMStorageModel.js.map
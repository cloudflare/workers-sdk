// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { Capability } from './Target.js';
import { SDKModel } from './SDKModel.js';
export class StorageKeyManager extends SDKModel {
    #mainStorageKeyInternal;
    #storageKeysInternal;
    constructor(target) {
        super(target);
        this.#mainStorageKeyInternal = '';
        this.#storageKeysInternal = new Set();
    }
    updateStorageKeys(storageKeys) {
        const oldStorageKeys = this.#storageKeysInternal;
        this.#storageKeysInternal = storageKeys;
        for (const storageKey of oldStorageKeys) {
            if (!this.#storageKeysInternal.has(storageKey)) {
                this.dispatchEventToListeners(Events.StorageKeyRemoved, storageKey);
            }
        }
        for (const storageKey of this.#storageKeysInternal) {
            if (!oldStorageKeys.has(storageKey)) {
                this.dispatchEventToListeners(Events.StorageKeyAdded, storageKey);
            }
        }
    }
    storageKeys() {
        return [...this.#storageKeysInternal];
    }
    mainStorageKey() {
        return this.#mainStorageKeyInternal;
    }
    setMainStorageKey(storageKey) {
        this.#mainStorageKeyInternal = storageKey;
        this.dispatchEventToListeners(Events.MainStorageKeyChanged, {
            mainStorageKey: this.#mainStorageKeyInternal,
        });
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["StorageKeyAdded"] = "StorageKeyAdded";
    Events["StorageKeyRemoved"] = "StorageKeyRemoved";
    Events["MainStorageKeyChanged"] = "MainStorageKeyChanged";
})(Events || (Events = {}));
// TODO(jarhar): this is the one of the two usages of Capability.None. Do something about it!
SDKModel.register(StorageKeyManager, { capabilities: Capability.None, autostart: false });
//# sourceMappingURL=StorageKeyManager.js.map
// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { Capability } from './Target.js';
import { SDKModel } from './SDKModel.js';
export class SecurityOriginManager extends SDKModel {
    #mainSecurityOriginInternal;
    #unreachableMainSecurityOriginInternal;
    #securityOriginsInternal;
    constructor(target) {
        super(target);
        // if a URL is unreachable, the browser will jump to an error page at
        // 'chrome-error://chromewebdata/', and |this.#mainSecurityOriginInternal| stores
        // its origin. In this situation, the original unreachable URL's security
        // origin will be stored in |this.#unreachableMainSecurityOriginInternal|.
        this.#mainSecurityOriginInternal = '';
        this.#unreachableMainSecurityOriginInternal = '';
        this.#securityOriginsInternal = new Set();
    }
    updateSecurityOrigins(securityOrigins) {
        const oldOrigins = this.#securityOriginsInternal;
        this.#securityOriginsInternal = securityOrigins;
        for (const origin of oldOrigins) {
            if (!this.#securityOriginsInternal.has(origin)) {
                this.dispatchEventToListeners(Events.SecurityOriginRemoved, origin);
            }
        }
        for (const origin of this.#securityOriginsInternal) {
            if (!oldOrigins.has(origin)) {
                this.dispatchEventToListeners(Events.SecurityOriginAdded, origin);
            }
        }
    }
    securityOrigins() {
        return [...this.#securityOriginsInternal];
    }
    mainSecurityOrigin() {
        return this.#mainSecurityOriginInternal;
    }
    unreachableMainSecurityOrigin() {
        return this.#unreachableMainSecurityOriginInternal;
    }
    setMainSecurityOrigin(securityOrigin, unreachableSecurityOrigin) {
        this.#mainSecurityOriginInternal = securityOrigin;
        this.#unreachableMainSecurityOriginInternal = unreachableSecurityOrigin || null;
        this.dispatchEventToListeners(Events.MainSecurityOriginChanged, {
            mainSecurityOrigin: this.#mainSecurityOriginInternal,
            unreachableMainSecurityOrigin: this.#unreachableMainSecurityOriginInternal,
        });
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["SecurityOriginAdded"] = "SecurityOriginAdded";
    Events["SecurityOriginRemoved"] = "SecurityOriginRemoved";
    Events["MainSecurityOriginChanged"] = "MainSecurityOriginChanged";
})(Events || (Events = {}));
// TODO(jarhar): this is the one of the two usages of Capability.None. Do something about it!
SDKModel.register(SecurityOriginManager, { capabilities: Capability.None, autostart: false });
//# sourceMappingURL=SecurityOriginManager.js.map
// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { Capability } from './Target.js';
import { SDKModel } from './SDKModel.js';
export class WebAuthnModel extends SDKModel {
    #agent;
    constructor(target) {
        super(target);
        this.#agent = target.webAuthnAgent();
    }
    setVirtualAuthEnvEnabled(enable) {
        if (enable) {
            return this.#agent.invoke_enable({ enableUI: true });
        }
        return this.#agent.invoke_disable();
    }
    async addAuthenticator(options) {
        const response = await this.#agent.invoke_addVirtualAuthenticator({ options });
        return response.authenticatorId;
    }
    async removeAuthenticator(authenticatorId) {
        await this.#agent.invoke_removeVirtualAuthenticator({ authenticatorId });
    }
    async setAutomaticPresenceSimulation(authenticatorId, enabled) {
        await this.#agent.invoke_setAutomaticPresenceSimulation({ authenticatorId, enabled });
    }
    async getCredentials(authenticatorId) {
        const response = await this.#agent.invoke_getCredentials({ authenticatorId });
        return response.credentials;
    }
    async removeCredential(authenticatorId, credentialId) {
        await this.#agent.invoke_removeCredential({ authenticatorId, credentialId });
    }
}
SDKModel.register(WebAuthnModel, { capabilities: Capability.WebAuthn, autostart: false });
//# sourceMappingURL=WebAuthnModel.js.map
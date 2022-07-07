// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export class ExtensionEndpoint {
    port;
    nextRequestId = 0;
    pendingRequests;
    constructor(port) {
        this.port = port;
        this.port.onmessage = this.onResponse.bind(this);
        this.pendingRequests = new Map();
    }
    sendRequest(method, parameters) {
        return new Promise((resolve, reject) => {
            const requestId = this.nextRequestId++;
            this.pendingRequests.set(requestId, { resolve: resolve, reject });
            this.port.postMessage({ requestId, method, parameters });
        });
    }
    disconnect() {
        for (const { reject } of this.pendingRequests.values()) {
            reject(new Error('Extension endpoint disconnected'));
        }
        this.pendingRequests.clear();
        this.port.close();
    }
    onResponse({ data }) {
        if ('event' in data) {
            this.handleEvent(data);
            return;
        }
        const { requestId, result, error } = data;
        const pendingRequest = this.pendingRequests.get(requestId);
        if (!pendingRequest) {
            console.error(`No pending request ${requestId}`);
            return;
        }
        this.pendingRequests.delete(requestId);
        if (error) {
            pendingRequest.reject(new Error(error.message));
        }
        else {
            pendingRequest.resolve(result);
        }
    }
    handleEvent(_event) {
        throw new Error('handleEvent is not implemented');
    }
}
//# sourceMappingURL=ExtensionEndpoint.js.map
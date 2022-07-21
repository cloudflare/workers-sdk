// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { Capability } from './Target.js';
import { SDKModel } from './SDKModel.js';
export class TracingManager extends SDKModel {
    #tracingAgent;
    #activeClient;
    #eventBufferSize;
    #eventsRetrieved;
    #finishing;
    constructor(target) {
        super(target);
        this.#tracingAgent = target.tracingAgent();
        target.registerTracingDispatcher(new TracingDispatcher(this));
        this.#activeClient = null;
        this.#eventBufferSize = 0;
        this.#eventsRetrieved = 0;
    }
    bufferUsage(usage, eventCount, percentFull) {
        this.#eventBufferSize = eventCount === undefined ? null : eventCount;
        if (this.#activeClient) {
            this.#activeClient.tracingBufferUsage(usage || percentFull || 0);
        }
    }
    eventsCollected(events) {
        if (!this.#activeClient) {
            return;
        }
        this.#activeClient.traceEventsCollected(events);
        this.#eventsRetrieved += events.length;
        if (!this.#eventBufferSize) {
            this.#activeClient.eventsRetrievalProgress(0);
            return;
        }
        if (this.#eventsRetrieved > this.#eventBufferSize) {
            this.#eventsRetrieved = this.#eventBufferSize;
        }
        this.#activeClient.eventsRetrievalProgress(this.#eventsRetrieved / this.#eventBufferSize);
    }
    tracingComplete() {
        this.#eventBufferSize = 0;
        this.#eventsRetrieved = 0;
        if (this.#activeClient) {
            this.#activeClient.tracingComplete();
            this.#activeClient = null;
        }
        this.#finishing = false;
    }
    // TODO(petermarshall): Use the traceConfig argument instead of deprecated
    // categories + options.
    async start(client, categoryFilter, options) {
        if (this.#activeClient) {
            throw new Error('Tracing is already started');
        }
        const bufferUsageReportingIntervalMs = 500;
        this.#activeClient = client;
        const args = {
            bufferUsageReportingInterval: bufferUsageReportingIntervalMs,
            categories: categoryFilter,
            options: options,
            transferMode: "ReportEvents" /* ReportEvents */,
        };
        const response = await this.#tracingAgent.invoke_start(args);
        if (response.getError()) {
            this.#activeClient = null;
        }
        return response;
    }
    stop() {
        if (!this.#activeClient) {
            throw new Error('Tracing is not started');
        }
        if (this.#finishing) {
            throw new Error('Tracing is already being stopped');
        }
        this.#finishing = true;
        void this.#tracingAgent.invoke_end();
    }
}
class TracingDispatcher {
    #tracingManager;
    constructor(tracingManager) {
        this.#tracingManager = tracingManager;
    }
    bufferUsage({ value, eventCount, percentFull }) {
        this.#tracingManager.bufferUsage(value, eventCount, percentFull);
    }
    dataCollected({ value }) {
        this.#tracingManager.eventsCollected(value);
    }
    tracingComplete() {
        this.#tracingManager.tracingComplete();
    }
}
SDKModel.register(TracingManager, { capabilities: Capability.Tracing, autostart: false });
//# sourceMappingURL=TracingManager.js.map
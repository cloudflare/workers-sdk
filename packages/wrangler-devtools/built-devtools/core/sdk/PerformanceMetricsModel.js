// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../platform/platform.js';
import { Capability } from './Target.js';
import { SDKModel } from './SDKModel.js';
export class PerformanceMetricsModel extends SDKModel {
    #agent;
    #metricModes;
    #metricData;
    constructor(target) {
        super(target);
        this.#agent = target.performanceAgent();
        this.#metricModes = new Map([
            ['TaskDuration', "CumulativeTime" /* CumulativeTime */],
            ['ScriptDuration', "CumulativeTime" /* CumulativeTime */],
            ['LayoutDuration', "CumulativeTime" /* CumulativeTime */],
            ['RecalcStyleDuration', "CumulativeTime" /* CumulativeTime */],
            ['LayoutCount', "CumulativeCount" /* CumulativeCount */],
            ['RecalcStyleCount', "CumulativeCount" /* CumulativeCount */],
        ]);
        this.#metricData = new Map();
    }
    enable() {
        return this.#agent.invoke_enable({});
    }
    disable() {
        return this.#agent.invoke_disable();
    }
    async requestMetrics() {
        const rawMetrics = await this.#agent.invoke_getMetrics() || [];
        const metrics = new Map();
        const timestamp = performance.now();
        for (const metric of rawMetrics.metrics) {
            let data = this.#metricData.get(metric.name);
            if (!data) {
                data = { lastValue: undefined, lastTimestamp: undefined };
                this.#metricData.set(metric.name, data);
            }
            let value;
            switch (this.#metricModes.get(metric.name)) {
                case "CumulativeTime" /* CumulativeTime */:
                    value = (data.lastTimestamp && data.lastValue) ?
                        Platform.NumberUtilities.clamp((metric.value - data.lastValue) * 1000 / (timestamp - data.lastTimestamp), 0, 1) :
                        0;
                    data.lastValue = metric.value;
                    data.lastTimestamp = timestamp;
                    break;
                case "CumulativeCount" /* CumulativeCount */:
                    value = (data.lastTimestamp && data.lastValue) ?
                        Math.max(0, (metric.value - data.lastValue) * 1000 / (timestamp - data.lastTimestamp)) :
                        0;
                    data.lastValue = metric.value;
                    data.lastTimestamp = timestamp;
                    break;
                default:
                    value = metric.value;
                    break;
            }
            metrics.set(metric.name, value);
        }
        return { metrics: metrics, timestamp: timestamp };
    }
}
SDKModel.register(PerformanceMetricsModel, { capabilities: Capability.DOM, autostart: false });
//# sourceMappingURL=PerformanceMetricsModel.js.map
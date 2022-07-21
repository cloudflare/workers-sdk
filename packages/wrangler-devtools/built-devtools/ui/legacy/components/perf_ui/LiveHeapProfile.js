// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../../../core/common/common.js';
import * as Host from '../../../../core/host/host.js';
import * as SDK from '../../../../core/sdk/sdk.js';
import { Memory } from './LineLevelProfile.js';
let liveHeapProfileInstance;
export class LiveHeapProfile {
    running;
    sessionId;
    loadEventCallback;
    setting;
    constructor() {
        this.running = false;
        this.sessionId = 0;
        this.loadEventCallback = () => { };
        this.setting = Common.Settings.Settings.instance().moduleSetting('memoryLiveHeapProfile');
        this.setting.addChangeListener(event => event.data ? this.startProfiling() : this.stopProfiling());
        if (this.setting.get()) {
            void this.startProfiling();
        }
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!liveHeapProfileInstance || forceNew) {
            liveHeapProfileInstance = new LiveHeapProfile();
        }
        return liveHeapProfileInstance;
    }
    async run() {
        return;
    }
    modelAdded(model) {
        void model.startSampling(1e4);
    }
    modelRemoved(_model) {
        // Cannot do much when the model has already been removed.
    }
    async startProfiling() {
        if (this.running) {
            return;
        }
        this.running = true;
        const sessionId = this.sessionId;
        SDK.TargetManager.TargetManager.instance().observeModels(SDK.HeapProfilerModel.HeapProfilerModel, this);
        SDK.TargetManager.TargetManager.instance().addModelListener(SDK.ResourceTreeModel.ResourceTreeModel, SDK.ResourceTreeModel.Events.Load, this.loadEventFired, this);
        do {
            const models = SDK.TargetManager.TargetManager.instance().models(SDK.HeapProfilerModel.HeapProfilerModel);
            const profiles = await Promise.all(models.map(model => model.getSamplingProfile()));
            if (sessionId !== this.sessionId) {
                break;
            }
            Memory.instance().reset();
            for (let i = 0; i < profiles.length; ++i) {
                const profile = profiles[i];
                if (!profile) {
                    continue;
                }
                Memory.instance().appendHeapProfile(profile, models[i].target());
            }
            await Promise.race([
                new Promise(r => window.setTimeout(r, Host.InspectorFrontendHost.isUnderTest() ? 10 : 5000)),
                new Promise(r => {
                    this.loadEventCallback = r;
                }),
            ]);
        } while (sessionId === this.sessionId);
        SDK.TargetManager.TargetManager.instance().unobserveModels(SDK.HeapProfilerModel.HeapProfilerModel, this);
        SDK.TargetManager.TargetManager.instance().removeModelListener(SDK.ResourceTreeModel.ResourceTreeModel, SDK.ResourceTreeModel.Events.Load, this.loadEventFired, this);
        for (const model of SDK.TargetManager.TargetManager.instance().models(SDK.HeapProfilerModel.HeapProfilerModel)) {
            void model.stopSampling();
        }
        Memory.instance().reset();
    }
    stopProfiling() {
        if (!this.running) {
            return;
        }
        this.running = false;
        this.sessionId++;
    }
    loadEventFired() {
        this.loadEventCallback();
    }
}
//# sourceMappingURL=LiveHeapProfile.js.map
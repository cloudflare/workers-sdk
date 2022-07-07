// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { TimelineLoader } from './TimelineLoader.js';
export class ExtensionTracingSession {
    provider;
    performanceModel;
    completionCallback;
    completionPromise;
    timeOffset;
    constructor(provider, performanceModel) {
        this.provider = provider;
        this.performanceModel = performanceModel;
        this.completionPromise = new Promise(fulfill => {
            this.completionCallback = fulfill;
        });
        this.timeOffset = 0;
    }
    loadingStarted() {
    }
    processingStarted() {
    }
    loadingProgress(_progress) {
    }
    loadingComplete(tracingModel) {
        if (!tracingModel) {
            return;
        }
        this.performanceModel.addExtensionEvents(this.provider.longDisplayName(), tracingModel, this.timeOffset);
        this.completionCallback();
    }
    complete(url, timeOffsetMicroseconds) {
        if (!url) {
            this.completionCallback();
            return;
        }
        this.timeOffset = timeOffsetMicroseconds;
        TimelineLoader.loadFromURL(url, this);
    }
    start() {
        this.provider.start(this);
    }
    stop() {
        this.provider.stop();
        return this.completionPromise;
    }
}
//# sourceMappingURL=ExtensionTracingSession.js.map
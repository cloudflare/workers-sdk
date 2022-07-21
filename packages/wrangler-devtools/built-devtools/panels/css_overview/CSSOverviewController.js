// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
export class OverviewController extends Common.ObjectWrapper.ObjectWrapper {
    currentUrl;
    constructor() {
        super();
        this.currentUrl = SDK.TargetManager.TargetManager.instance().inspectedURL();
        SDK.TargetManager.TargetManager.instance().addEventListener(SDK.TargetManager.Events.InspectedURLChanged, this.#checkUrlAndResetIfChanged, this);
    }
    #checkUrlAndResetIfChanged() {
        if (this.currentUrl === SDK.TargetManager.TargetManager.instance().inspectedURL()) {
            return;
        }
        this.currentUrl = SDK.TargetManager.TargetManager.instance().inspectedURL();
        this.dispatchEventToListeners("Reset" /* Reset */);
    }
}
//# sourceMappingURL=CSSOverviewController.js.map
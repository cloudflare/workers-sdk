// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Legacy from '../../ui/legacy/legacy.js';
let windowBoundsServiceImplInstance;
export class WindowBoundsServiceImpl {
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!windowBoundsServiceImplInstance || forceNew) {
            windowBoundsServiceImplInstance = new WindowBoundsServiceImpl();
        }
        return windowBoundsServiceImplInstance;
    }
    getDevToolsBoundingElement() {
        return Legacy.InspectorView.InspectorView.maybeGetInspectorViewInstance()?.element || document.body;
    }
}
//# sourceMappingURL=WindowBoundsService.js.map
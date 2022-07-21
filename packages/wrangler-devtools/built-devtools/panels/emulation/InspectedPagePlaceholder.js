// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as UI from '../../ui/legacy/legacy.js';
import inspectedPagePlaceholderStyles from './inspectedPagePlaceholder.css.legacy.js';
let inspectedPagePlaceholderInstance;
export class InspectedPagePlaceholder extends Common.ObjectWrapper.eventMixin(UI.Widget.Widget) {
    updateId;
    constructor() {
        super(true);
        this.registerRequiredCSS(inspectedPagePlaceholderStyles);
        UI.ZoomManager.ZoomManager.instance().addEventListener("ZoomChanged" /* ZoomChanged */, this.onResize, this);
        this.restoreMinimumSize();
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!inspectedPagePlaceholderInstance || forceNew) {
            inspectedPagePlaceholderInstance = new InspectedPagePlaceholder();
        }
        return inspectedPagePlaceholderInstance;
    }
    onResize() {
        if (this.updateId) {
            this.element.window().cancelAnimationFrame(this.updateId);
        }
        this.updateId = this.element.window().requestAnimationFrame(this.update.bind(this, false));
    }
    restoreMinimumSize() {
        this.setMinimumSize(150, 150);
    }
    clearMinimumSize() {
        this.setMinimumSize(1, 1);
    }
    dipPageRect() {
        const zoomFactor = UI.ZoomManager.ZoomManager.instance().zoomFactor();
        const rect = this.element.getBoundingClientRect();
        const bodyRect = this.element.ownerDocument.body.getBoundingClientRect();
        const left = Math.max(rect.left * zoomFactor, bodyRect.left * zoomFactor);
        const top = Math.max(rect.top * zoomFactor, bodyRect.top * zoomFactor);
        const bottom = Math.min(rect.bottom * zoomFactor, bodyRect.bottom * zoomFactor);
        const right = Math.min(rect.right * zoomFactor, bodyRect.right * zoomFactor);
        return { x: left, y: top, width: right - left, height: bottom - top };
    }
    update(force) {
        delete this.updateId;
        const rect = this.dipPageRect();
        const bounds = {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            height: Math.max(1, Math.round(rect.height)),
            width: Math.max(1, Math.round(rect.width)),
        };
        if (force) {
            // Short term fix for Lighthouse interop.
            --bounds.height;
            this.dispatchEventToListeners("Update" /* Update */, bounds);
            ++bounds.height;
        }
        this.dispatchEventToListeners("Update" /* Update */, bounds);
    }
}
//# sourceMappingURL=InspectedPagePlaceholder.js.map
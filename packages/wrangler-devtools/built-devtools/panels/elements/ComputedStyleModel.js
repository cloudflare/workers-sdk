// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
export class ComputedStyleModel extends Common.ObjectWrapper.ObjectWrapper {
    nodeInternal;
    cssModelInternal;
    eventListeners;
    frameResizedTimer;
    computedStylePromise;
    constructor() {
        super();
        this.nodeInternal = UI.Context.Context.instance().flavor(SDK.DOMModel.DOMNode);
        this.cssModelInternal = null;
        this.eventListeners = [];
        UI.Context.Context.instance().addFlavorChangeListener(SDK.DOMModel.DOMNode, this.onNodeChanged, this);
    }
    node() {
        return this.nodeInternal;
    }
    cssModel() {
        return this.cssModelInternal && this.cssModelInternal.isEnabled() ? this.cssModelInternal : null;
    }
    onNodeChanged(event) {
        this.nodeInternal = event.data;
        this.updateModel(this.nodeInternal ? this.nodeInternal.domModel().cssModel() : null);
        this.onComputedStyleChanged(null);
    }
    updateModel(cssModel) {
        if (this.cssModelInternal === cssModel) {
            return;
        }
        Common.EventTarget.removeEventListeners(this.eventListeners);
        this.cssModelInternal = cssModel;
        const domModel = cssModel ? cssModel.domModel() : null;
        const resourceTreeModel = cssModel ? cssModel.target().model(SDK.ResourceTreeModel.ResourceTreeModel) : null;
        if (cssModel && domModel && resourceTreeModel) {
            this.eventListeners = [
                cssModel.addEventListener(SDK.CSSModel.Events.StyleSheetAdded, this.onComputedStyleChanged, this),
                cssModel.addEventListener(SDK.CSSModel.Events.StyleSheetRemoved, this.onComputedStyleChanged, this),
                cssModel.addEventListener(SDK.CSSModel.Events.StyleSheetChanged, this.onComputedStyleChanged, this),
                cssModel.addEventListener(SDK.CSSModel.Events.FontsUpdated, this.onComputedStyleChanged, this),
                cssModel.addEventListener(SDK.CSSModel.Events.MediaQueryResultChanged, this.onComputedStyleChanged, this),
                cssModel.addEventListener(SDK.CSSModel.Events.PseudoStateForced, this.onComputedStyleChanged, this),
                cssModel.addEventListener(SDK.CSSModel.Events.ModelWasEnabled, this.onComputedStyleChanged, this),
                domModel.addEventListener(SDK.DOMModel.Events.DOMMutated, this.onDOMModelChanged, this),
                resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.FrameResized, this.onFrameResized, this),
            ];
        }
    }
    onComputedStyleChanged(event) {
        delete this.computedStylePromise;
        this.dispatchEventToListeners("ComputedStyleChanged" /* ComputedStyleChanged */, event?.data ?? null);
    }
    onDOMModelChanged(event) {
        // Any attribute removal or modification can affect the styles of "related" nodes.
        const node = event.data;
        if (!this.nodeInternal ||
            this.nodeInternal !== node && node.parentNode !== this.nodeInternal.parentNode &&
                !node.isAncestor(this.nodeInternal)) {
            return;
        }
        this.onComputedStyleChanged(null);
    }
    onFrameResized() {
        function refreshContents() {
            this.onComputedStyleChanged(null);
            delete this.frameResizedTimer;
        }
        if (this.frameResizedTimer) {
            clearTimeout(this.frameResizedTimer);
        }
        this.frameResizedTimer = window.setTimeout(refreshContents.bind(this), 100);
    }
    elementNode() {
        const node = this.node();
        if (!node) {
            return null;
        }
        return node.enclosingElementOrSelf();
    }
    async fetchComputedStyle() {
        const elementNode = this.elementNode();
        const cssModel = this.cssModel();
        if (!elementNode || !cssModel) {
            return null;
        }
        const nodeId = elementNode.id;
        if (!nodeId) {
            return null;
        }
        if (!this.computedStylePromise) {
            this.computedStylePromise = cssModel.getComputedStyle(nodeId).then(verifyOutdated.bind(this, elementNode));
        }
        return this.computedStylePromise;
        function verifyOutdated(elementNode, style) {
            return elementNode === this.elementNode() && style ? new ComputedStyle(elementNode, style) :
                null;
        }
    }
}
export class ComputedStyle {
    node;
    computedStyle;
    constructor(node, computedStyle) {
        this.node = node;
        this.computedStyle = computedStyle;
    }
}
//# sourceMappingURL=ComputedStyleModel.js.map
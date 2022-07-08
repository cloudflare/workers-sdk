// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { DOMModel } from './DOMModel.js';
export var Layer;
(function (Layer) {
    // TODO(crbug.com/1167717): Make this a const enum again
    // eslint-disable-next-line rulesdir/const_enum
    let ScrollRectType;
    (function (ScrollRectType) {
        ScrollRectType["NonFastScrollable"] = "NonFastScrollable";
        ScrollRectType["TouchEventHandler"] = "TouchEventHandler";
        ScrollRectType["WheelEventHandler"] = "WheelEventHandler";
        ScrollRectType["RepaintsOnScroll"] = "RepaintsOnScroll";
        ScrollRectType["MainThreadScrollingReason"] = "MainThreadScrollingReason";
    })(ScrollRectType = Layer.ScrollRectType || (Layer.ScrollRectType = {}));
})(Layer || (Layer = {}));
export class StickyPositionConstraint {
    #stickyBoxRectInternal;
    #containingBlockRectInternal;
    #nearestLayerShiftingStickyBoxInternal;
    #nearestLayerShiftingContainingBlockInternal;
    constructor(layerTree, constraint) {
        this.#stickyBoxRectInternal = constraint.stickyBoxRect;
        this.#containingBlockRectInternal = constraint.containingBlockRect;
        this.#nearestLayerShiftingStickyBoxInternal = null;
        if (layerTree && constraint.nearestLayerShiftingStickyBox) {
            this.#nearestLayerShiftingStickyBoxInternal = layerTree.layerById(constraint.nearestLayerShiftingStickyBox);
        }
        this.#nearestLayerShiftingContainingBlockInternal = null;
        if (layerTree && constraint.nearestLayerShiftingContainingBlock) {
            this.#nearestLayerShiftingContainingBlockInternal =
                layerTree.layerById(constraint.nearestLayerShiftingContainingBlock);
        }
    }
    stickyBoxRect() {
        return this.#stickyBoxRectInternal;
    }
    containingBlockRect() {
        return this.#containingBlockRectInternal;
    }
    nearestLayerShiftingStickyBox() {
        return this.#nearestLayerShiftingStickyBoxInternal;
    }
    nearestLayerShiftingContainingBlock() {
        return this.#nearestLayerShiftingContainingBlockInternal;
    }
}
export class LayerTreeBase {
    #targetInternal;
    #domModel;
    layersById;
    #rootInternal;
    #contentRootInternal;
    #backendNodeIdToNodeInternal;
    #viewportSizeInternal;
    constructor(target) {
        this.#targetInternal = target;
        this.#domModel = target ? target.model(DOMModel) : null;
        this.layersById = new Map();
        this.#rootInternal = null;
        this.#contentRootInternal = null;
        this.#backendNodeIdToNodeInternal = new Map();
    }
    target() {
        return this.#targetInternal;
    }
    root() {
        return this.#rootInternal;
    }
    setRoot(root) {
        this.#rootInternal = root;
    }
    contentRoot() {
        return this.#contentRootInternal;
    }
    setContentRoot(contentRoot) {
        this.#contentRootInternal = contentRoot;
    }
    forEachLayer(callback, root) {
        if (!root) {
            root = this.root();
            if (!root) {
                return false;
            }
        }
        return callback(root) || root.children().some(this.forEachLayer.bind(this, callback));
    }
    layerById(id) {
        return this.layersById.get(id) || null;
    }
    async resolveBackendNodeIds(requestedNodeIds) {
        if (!requestedNodeIds.size || !this.#domModel) {
            return;
        }
        const nodesMap = await this.#domModel.pushNodesByBackendIdsToFrontend(requestedNodeIds);
        if (!nodesMap) {
            return;
        }
        for (const nodeId of nodesMap.keys()) {
            this.#backendNodeIdToNodeInternal.set(nodeId, nodesMap.get(nodeId) || null);
        }
    }
    backendNodeIdToNode() {
        return this.#backendNodeIdToNodeInternal;
    }
    setViewportSize(viewportSize) {
        this.#viewportSizeInternal = viewportSize;
    }
    viewportSize() {
        return this.#viewportSizeInternal;
    }
    nodeForId(id) {
        return this.#domModel ? this.#domModel.nodeForId(id) : null;
    }
}
//# sourceMappingURL=LayerTreeBase.js.map
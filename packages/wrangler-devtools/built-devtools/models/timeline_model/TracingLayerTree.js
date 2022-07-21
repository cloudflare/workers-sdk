// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/* eslint-disable @typescript-eslint/naming-convention */
import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
export class TracingLayerTree extends SDK.LayerTreeBase.LayerTreeBase {
    tileById;
    paintProfilerModel;
    constructor(target) {
        super(target);
        this.tileById = new Map();
        this.paintProfilerModel = target && target.model(SDK.PaintProfiler.PaintProfilerModel);
    }
    async setLayers(root, layers, paints) {
        const idsToResolve = new Set();
        if (root) {
            // This is a legacy code path for compatibility, as cc is removing
            // layer tree hierarchy, this code will eventually be removed.
            this.extractNodeIdsToResolve(idsToResolve, {}, root);
        }
        else if (layers) {
            for (let i = 0; i < layers.length; ++i) {
                this.extractNodeIdsToResolve(idsToResolve, {}, layers[i]);
            }
        }
        await this.resolveBackendNodeIds(idsToResolve);
        const oldLayersById = this.layersById;
        this.layersById = new Map();
        this.setContentRoot(null);
        if (root) {
            const convertedLayers = this.innerSetLayers(oldLayersById, root);
            this.setRoot(convertedLayers);
        }
        else if (layers) {
            const processedLayers = layers.map(this.innerSetLayers.bind(this, oldLayersById));
            const contentRoot = this.contentRoot();
            if (!contentRoot) {
                throw new Error('Content root is not set.');
            }
            this.setRoot(contentRoot);
            for (let i = 0; i < processedLayers.length; ++i) {
                if (processedLayers[i].id() !== contentRoot.id()) {
                    contentRoot.addChild(processedLayers[i]);
                }
            }
        }
        this.setPaints(paints);
    }
    setTiles(tiles) {
        this.tileById = new Map();
        for (const tile of tiles) {
            this.tileById.set(tile.id, tile);
        }
    }
    pictureForRasterTile(tileId) {
        const tile = this.tileById.get('cc::Tile/' + tileId);
        if (!tile) {
            Common.Console.Console.instance().error(`Tile ${tileId} is missing`);
            return Promise.resolve(null);
        }
        const layer = this.layerById(tile.layer_id);
        if (!layer) {
            Common.Console.Console.instance().error(`Layer ${tile.layer_id} for tile ${tileId} is not found`);
            return Promise.resolve(null);
        }
        return layer.pictureForRect(tile.content_rect);
    }
    setPaints(paints) {
        for (let i = 0; i < paints.length; ++i) {
            const layer = this.layersById.get(paints[i].layerId());
            if (layer) {
                layer.addPaintEvent(paints[i]);
            }
        }
    }
    innerSetLayers(oldLayersById, payload) {
        let layer = oldLayersById.get(payload.layer_id);
        if (layer) {
            layer.reset(payload);
        }
        else {
            layer = new TracingLayer(this.paintProfilerModel, payload);
        }
        this.layersById.set(payload.layer_id, layer);
        if (payload.owner_node) {
            layer.setNode(this.backendNodeIdToNode().get(payload.owner_node) || null);
        }
        if (!this.contentRoot() && layer.drawsContent()) {
            this.setContentRoot(layer);
        }
        for (let i = 0; payload.children && i < payload.children.length; ++i) {
            layer.addChild(this.innerSetLayers(oldLayersById, payload.children[i]));
        }
        return layer;
    }
    extractNodeIdsToResolve(nodeIdsToResolve, seenNodeIds, payload) {
        const backendNodeId = payload.owner_node;
        if (backendNodeId && !this.backendNodeIdToNode().has(backendNodeId)) {
            nodeIdsToResolve.add(backendNodeId);
        }
        for (let i = 0; payload.children && i < payload.children.length; ++i) {
            this.extractNodeIdsToResolve(nodeIdsToResolve, seenNodeIds, payload.children[i]);
        }
    }
}
export class TracingLayer {
    parentLayerId;
    parentInternal;
    layerId;
    nodeInternal;
    offsetXInternal;
    offsetYInternal;
    widthInternal;
    heightInternal;
    childrenInternal;
    quadInternal;
    scrollRectsInternal;
    gpuMemoryUsageInternal;
    paints;
    compositingReasonIds;
    drawsContentInternal;
    paintProfilerModel;
    constructor(paintProfilerModel, payload) {
        this.parentLayerId = null;
        this.parentInternal = null;
        this.layerId = '';
        this.nodeInternal = null;
        this.offsetXInternal = -1;
        this.offsetYInternal = -1;
        this.widthInternal = -1;
        this.heightInternal = -1;
        this.childrenInternal = [];
        this.quadInternal = [];
        this.scrollRectsInternal = [];
        this.gpuMemoryUsageInternal = -1;
        this.paints = [];
        this.compositingReasonIds = [];
        this.drawsContentInternal = false;
        this.paintProfilerModel = paintProfilerModel;
        this.reset(payload);
    }
    reset(payload) {
        this.nodeInternal = null;
        this.layerId = String(payload.layer_id);
        this.offsetXInternal = payload.position[0];
        this.offsetYInternal = payload.position[1];
        this.widthInternal = payload.bounds.width;
        this.heightInternal = payload.bounds.height;
        this.childrenInternal = [];
        this.parentLayerId = null;
        this.parentInternal = null;
        this.quadInternal = payload.layer_quad || [];
        this.createScrollRects(payload);
        // Keep payload.compositing_reasons as a default
        // but use the newer payload.debug_info.compositing_reasons
        // if the first one is not set.
        this.compositingReasonIds =
            payload.compositing_reason_ids || (payload.debug_info && payload.debug_info.compositing_reason_ids) || [];
        this.drawsContentInternal = Boolean(payload.draws_content);
        this.gpuMemoryUsageInternal = payload.gpu_memory_usage;
        this.paints = [];
    }
    id() {
        return this.layerId;
    }
    parentId() {
        return this.parentLayerId;
    }
    parent() {
        return this.parentInternal;
    }
    isRoot() {
        return !this.parentId();
    }
    children() {
        return this.childrenInternal;
    }
    addChild(childParam) {
        const child = childParam;
        if (child.parentInternal) {
            console.assert(false, 'Child already has a parent');
        }
        this.childrenInternal.push(child);
        child.parentInternal = this;
        child.parentLayerId = this.layerId;
    }
    setNode(node) {
        this.nodeInternal = node;
    }
    node() {
        return this.nodeInternal;
    }
    nodeForSelfOrAncestor() {
        let layer = this;
        for (; layer; layer = layer.parent()) {
            if (layer.node()) {
                return layer.node();
            }
        }
        return null;
    }
    offsetX() {
        return this.offsetXInternal;
    }
    offsetY() {
        return this.offsetYInternal;
    }
    width() {
        return this.widthInternal;
    }
    height() {
        return this.heightInternal;
    }
    transform() {
        return null;
    }
    quad() {
        return this.quadInternal;
    }
    anchorPoint() {
        return [0.5, 0.5, 0];
    }
    invisible() {
        return false;
    }
    paintCount() {
        return 0;
    }
    lastPaintRect() {
        return null;
    }
    scrollRects() {
        return this.scrollRectsInternal;
    }
    stickyPositionConstraint() {
        // TODO(smcgruer): Provide sticky layer information in traces.
        return null;
    }
    gpuMemoryUsage() {
        return this.gpuMemoryUsageInternal;
    }
    snapshots() {
        return this.paints.map(paint => paint.snapshotPromise().then(snapshot => {
            if (!snapshot) {
                return null;
            }
            const rect = { x: snapshot.rect[0], y: snapshot.rect[1], width: snapshot.rect[2], height: snapshot.rect[3] };
            return { rect: rect, snapshot: snapshot.snapshot };
        }));
    }
    pictureForRect(targetRect) {
        return Promise.all(this.paints.map(paint => paint.picturePromise())).then(pictures => {
            const filteredPictures = pictures.filter(picture => picture && rectsOverlap(picture.rect, targetRect));
            const fragments = filteredPictures.map(picture => ({ x: picture.rect[0], y: picture.rect[1], picture: picture.serializedPicture }));
            if (!fragments.length || !this.paintProfilerModel) {
                return null;
            }
            const x0 = fragments.reduce((min, item) => Math.min(min, item.x), Infinity);
            const y0 = fragments.reduce((min, item) => Math.min(min, item.y), Infinity);
            // Rect is in layer content coordinates, make it relative to picture by offsetting to the top left corner.
            const rect = { x: targetRect[0] - x0, y: targetRect[1] - y0, width: targetRect[2], height: targetRect[3] };
            return this.paintProfilerModel.loadSnapshotFromFragments(fragments).then(snapshot => snapshot ? { rect: rect, snapshot: snapshot } : null);
        });
        function segmentsOverlap(a1, a2, b1, b2) {
            console.assert(a1 <= a2 && b1 <= b2, 'segments should be specified as ordered pairs');
            return a2 > b1 && a1 < b2;
        }
        function rectsOverlap(a, b) {
            return segmentsOverlap(a[0], a[0] + a[2], b[0], b[0] + b[2]) &&
                segmentsOverlap(a[1], a[1] + a[3], b[1], b[1] + b[3]);
        }
    }
    scrollRectsFromParams(params, type) {
        return { rect: { x: params[0], y: params[1], width: params[2], height: params[3] }, type: type };
    }
    createScrollRects(payload) {
        const nonPayloadScrollRects = [];
        if (payload.non_fast_scrollable_region) {
            nonPayloadScrollRects.push(this.scrollRectsFromParams(payload.non_fast_scrollable_region, 'NonFastScrollable'));
        }
        if (payload.touch_event_handler_region) {
            nonPayloadScrollRects.push(this.scrollRectsFromParams(payload.touch_event_handler_region, "TouchEventHandler" /* TouchEventHandler */));
        }
        if (payload.wheel_event_handler_region) {
            nonPayloadScrollRects.push(this.scrollRectsFromParams(payload.wheel_event_handler_region, "WheelEventHandler" /* WheelEventHandler */));
        }
        if (payload.scroll_event_handler_region) {
            nonPayloadScrollRects.push(this.scrollRectsFromParams(payload.scroll_event_handler_region, "RepaintsOnScroll" /* RepaintsOnScroll */));
        }
        // SDK.LayerBaseTree.Layer.ScrollRectType and Protocol.LayerTree.ScrollRectType are the
        // same type, but we need to use the indirection of the nonPayloadScrollRects since
        // the ScrollRectType is defined as a string in SDK.LayerBaseTree.Layer.ScrollRectType.
        this.scrollRectsInternal = nonPayloadScrollRects;
    }
    addPaintEvent(paint) {
        this.paints.push(paint);
    }
    requestCompositingReasonIds() {
        return Promise.resolve(this.compositingReasonIds);
    }
    drawsContent() {
        return this.drawsContentInternal;
    }
}
//# sourceMappingURL=TracingLayerTree.js.map
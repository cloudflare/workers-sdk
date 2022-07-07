/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
/* eslint-disable @typescript-eslint/naming-convention */
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import { RecordType, TimelineData } from './TimelineModel.js';
import { TracingLayerTree } from './TracingLayerTree.js';
export class TimelineFrameModel {
    categoryMapper;
    frames;
    frameById;
    beginFrameQueue;
    minimumRecordTime;
    lastFrame;
    mainFrameCommitted;
    mainFrameRequested;
    lastLayerTree;
    framePendingActivation;
    currentTaskTimeByCategory;
    target;
    framePendingCommit;
    lastBeginFrame;
    lastDroppedFrame;
    lastNeedsBeginFrame;
    lastTaskBeginTime;
    layerTreeId;
    currentProcessMainThread;
    constructor(categoryMapper) {
        this.categoryMapper = categoryMapper;
        this.reset();
    }
    getFrames() {
        return this.frames;
    }
    getFramesWithinWindow(startTime, endTime) {
        const firstFrame = Platform.ArrayUtilities.lowerBound(this.frames, startTime || 0, (time, frame) => time - frame.endTime);
        const lastFrame = Platform.ArrayUtilities.lowerBound(this.frames, endTime || Infinity, (time, frame) => time - frame.startTime);
        return this.frames.slice(firstFrame, lastFrame);
    }
    hasRasterTile(rasterTask) {
        const data = rasterTask.args['tileData'];
        if (!data) {
            return false;
        }
        const frameId = data['sourceFrameNumber'];
        const frame = frameId && this.frameById[frameId];
        if (!frame || !frame.layerTree) {
            return false;
        }
        return true;
    }
    rasterTilePromise(rasterTask) {
        if (!this.target) {
            return Promise.resolve(null);
        }
        const data = rasterTask.args['tileData'];
        const frameId = data['sourceFrameNumber'];
        const tileId = data['tileId'] && data['tileId']['id_ref'];
        const frame = frameId && this.frameById[frameId];
        if (!frame || !frame.layerTree || !tileId) {
            return Promise.resolve(null);
        }
        return frame.layerTree.layerTreePromise().then(layerTree => layerTree && layerTree.pictureForRasterTile(tileId));
    }
    reset() {
        this.minimumRecordTime = Infinity;
        this.frames = [];
        this.frameById = {};
        this.beginFrameQueue = new TimelineFrameBeginFrameQueue();
        this.lastFrame = null;
        this.lastLayerTree = null;
        this.mainFrameCommitted = false;
        this.mainFrameRequested = false;
        this.framePendingCommit = null;
        this.lastBeginFrame = null;
        this.lastDroppedFrame = null;
        this.lastNeedsBeginFrame = null;
        this.framePendingActivation = null;
        this.lastTaskBeginTime = null;
        this.target = null;
        this.layerTreeId = null;
        this.currentTaskTimeByCategory = {};
    }
    handleBeginFrame(startTime, seqId) {
        if (!this.lastFrame) {
            this.startFrame(startTime);
        }
        this.lastBeginFrame = startTime;
        this.beginFrameQueue.addFrameIfNotExists(seqId, startTime, false, false);
    }
    handleDroppedFrame(startTime, seqId, isPartial) {
        if (!this.lastFrame) {
            this.startFrame(startTime);
        }
        // This line handles the case where no BeginFrame event is issued for
        // the dropped frame. In this situation, add a BeginFrame to the queue
        // as if it actually occurred.
        this.beginFrameQueue.addFrameIfNotExists(seqId, startTime, true, isPartial);
        this.beginFrameQueue.setDropped(seqId, true);
        this.beginFrameQueue.setPartial(seqId, isPartial);
    }
    handleDrawFrame(startTime, seqId) {
        if (!this.lastFrame) {
            this.startFrame(startTime);
            return;
        }
        // - if it wasn't drawn, it didn't happen!
        // - only show frames that either did not wait for the main thread frame or had one committed.
        if (this.mainFrameCommitted || !this.mainFrameRequested) {
            if (this.lastNeedsBeginFrame) {
                const idleTimeEnd = this.framePendingActivation ? this.framePendingActivation.triggerTime :
                    (this.lastBeginFrame || this.lastNeedsBeginFrame);
                if (idleTimeEnd > this.lastFrame.startTime) {
                    this.lastFrame.idle = true;
                    this.lastBeginFrame = null;
                }
                this.lastNeedsBeginFrame = null;
            }
            const framesToVisualize = this.beginFrameQueue.processPendingBeginFramesOnDrawFrame(seqId);
            // Visualize the current frame and all pending frames before it.
            for (const frame of framesToVisualize) {
                const isLastFrameIdle = this.lastFrame.idle;
                // If |frame| is the first frame after an idle period, the CPU time
                // will be logged ("committed") under |frame| if applicable.
                this.startFrame(frame.startTime);
                if (isLastFrameIdle && this.framePendingActivation) {
                    this.commitPendingFrame();
                }
                if (frame.isDropped) {
                    this.lastFrame.dropped = true;
                }
                if (frame.isPartial) {
                    this.lastFrame.isPartial = true;
                }
            }
        }
        this.mainFrameCommitted = false;
    }
    handleActivateLayerTree() {
        if (!this.lastFrame) {
            return;
        }
        if (this.framePendingActivation && !this.lastNeedsBeginFrame) {
            this.commitPendingFrame();
        }
    }
    handleRequestMainThreadFrame() {
        if (!this.lastFrame) {
            return;
        }
        this.mainFrameRequested = true;
    }
    handleCompositeLayers() {
        if (!this.framePendingCommit) {
            return;
        }
        this.framePendingActivation = this.framePendingCommit;
        this.framePendingCommit = null;
        this.mainFrameRequested = false;
        this.mainFrameCommitted = true;
    }
    handleLayerTreeSnapshot(layerTree) {
        this.lastLayerTree = layerTree;
    }
    handleNeedFrameChanged(startTime, needsBeginFrame) {
        if (needsBeginFrame) {
            this.lastNeedsBeginFrame = startTime;
        }
    }
    startFrame(startTime) {
        if (this.lastFrame) {
            this.flushFrame(this.lastFrame, startTime);
        }
        this.lastFrame = new TimelineFrame(startTime, startTime - this.minimumRecordTime);
    }
    flushFrame(frame, endTime) {
        frame.setLayerTree(this.lastLayerTree);
        frame.setEndTime(endTime);
        if (this.lastLayerTree) {
            this.lastLayerTree.setPaints(frame.paints);
        }
        const lastFrame = this.frames[this.frames.length - 1];
        if (this.frames.length && lastFrame && (frame.startTime !== lastFrame.endTime || frame.startTime > frame.endTime)) {
            console.assert(false, `Inconsistent frame time for frame ${this.frames.length} (${frame.startTime} - ${frame.endTime})`);
        }
        this.frames.push(frame);
        if (typeof frame.mainFrameId === 'number') {
            this.frameById[frame.mainFrameId] = frame;
        }
    }
    commitPendingFrame() {
        if (!this.framePendingActivation || !this.lastFrame) {
            return;
        }
        this.lastFrame.addTimeForCategories(this.framePendingActivation.timeByCategory);
        this.lastFrame.paints = this.framePendingActivation.paints;
        this.lastFrame.mainFrameId = this.framePendingActivation.mainFrameId;
        this.framePendingActivation = null;
    }
    addTraceEvents(target, events, threadData) {
        this.target = target;
        let j = 0;
        this.currentProcessMainThread = threadData.length && threadData[0].thread || null;
        for (let i = 0; i < events.length; ++i) {
            while (j + 1 < threadData.length && threadData[j + 1].time <= events[i].startTime) {
                this.currentProcessMainThread = threadData[++j].thread;
            }
            this.addTraceEvent(events[i]);
        }
        this.currentProcessMainThread = null;
    }
    addTraceEvent(event) {
        if (event.startTime && event.startTime < this.minimumRecordTime) {
            this.minimumRecordTime = event.startTime;
        }
        if (event.name === RecordType.SetLayerTreeId) {
            this.layerTreeId = event.args['layerTreeId'] || event.args['data']['layerTreeId'];
        }
        else if (event.id && event.phase === SDK.TracingModel.Phase.SnapshotObject &&
            event.name === RecordType.LayerTreeHostImplSnapshot && Number(event.id) === this.layerTreeId && this.target) {
            const snapshot = event;
            this.handleLayerTreeSnapshot(new TracingFrameLayerTree(this.target, snapshot));
        }
        else {
            this.processCompositorEvents(event);
            if (event.thread === this.currentProcessMainThread) {
                this.addMainThreadTraceEvent(event);
            }
            else if (this.lastFrame && event.selfTime && !SDK.TracingModel.TracingModel.isTopLevelEvent(event)) {
                this.lastFrame.addTimeForCategory(this.categoryMapper(event), event.selfTime);
            }
        }
    }
    processCompositorEvents(event) {
        if (event.args['layerTreeId'] !== this.layerTreeId) {
            return;
        }
        const timestamp = event.startTime;
        if (event.name === RecordType.BeginFrame) {
            this.handleBeginFrame(timestamp, event.args['frameSeqId']);
        }
        else if (event.name === RecordType.DrawFrame) {
            this.handleDrawFrame(timestamp, event.args['frameSeqId']);
        }
        else if (event.name === RecordType.ActivateLayerTree) {
            this.handleActivateLayerTree();
        }
        else if (event.name === RecordType.RequestMainThreadFrame) {
            this.handleRequestMainThreadFrame();
        }
        else if (event.name === RecordType.NeedsBeginFrameChanged) {
            this.handleNeedFrameChanged(timestamp, event.args['data'] && event.args['data']['needsBeginFrame']);
        }
        else if (event.name === RecordType.DroppedFrame) {
            this.handleDroppedFrame(timestamp, event.args['frameSeqId'], event.args['hasPartialUpdate']);
        }
    }
    addMainThreadTraceEvent(event) {
        if (SDK.TracingModel.TracingModel.isTopLevelEvent(event)) {
            this.currentTaskTimeByCategory = {};
            this.lastTaskBeginTime = event.startTime;
        }
        if (!this.framePendingCommit && TimelineFrameModel.mainFrameMarkers.indexOf(event.name) >= 0) {
            this.framePendingCommit =
                new PendingFrame(this.lastTaskBeginTime || event.startTime, this.currentTaskTimeByCategory);
        }
        if (!this.framePendingCommit) {
            this.addTimeForCategory(this.currentTaskTimeByCategory, event);
            return;
        }
        this.addTimeForCategory(this.framePendingCommit.timeByCategory, event);
        if (event.name === RecordType.BeginMainThreadFrame && event.args['data'] && event.args['data']['frameId']) {
            this.framePendingCommit.mainFrameId = event.args['data']['frameId'];
        }
        if (event.name === RecordType.Paint && event.args['data']['layerId'] && TimelineData.forEvent(event).picture &&
            this.target) {
            this.framePendingCommit.paints.push(new LayerPaintEvent(event, this.target));
        }
        if (event.name === RecordType.CompositeLayers && event.args['layerTreeId'] === this.layerTreeId) {
            this.handleCompositeLayers();
        }
    }
    addTimeForCategory(timeByCategory, event) {
        if (!event.selfTime) {
            return;
        }
        const categoryName = this.categoryMapper(event);
        timeByCategory[categoryName] = (timeByCategory[categoryName] || 0) + event.selfTime;
    }
    static mainFrameMarkers = [
        RecordType.ScheduleStyleRecalculation,
        RecordType.InvalidateLayout,
        RecordType.BeginMainThreadFrame,
        RecordType.ScrollLayer,
    ];
}
export class TracingFrameLayerTree {
    target;
    snapshot;
    paintsInternal;
    constructor(target, snapshot) {
        this.target = target;
        this.snapshot = snapshot;
    }
    async layerTreePromise() {
        const result = await this.snapshot.objectPromise();
        if (!result) {
            return null;
        }
        const viewport = result['device_viewport_size'];
        const tiles = result['active_tiles'];
        const rootLayer = result['active_tree']['root_layer'];
        const layers = result['active_tree']['layers'];
        const layerTree = new TracingLayerTree(this.target);
        layerTree.setViewportSize(viewport);
        layerTree.setTiles(tiles);
        await layerTree.setLayers(rootLayer, layers, this.paintsInternal || []);
        return layerTree;
    }
    paints() {
        return this.paintsInternal || [];
    }
    setPaints(paints) {
        this.paintsInternal = paints;
    }
}
export class TimelineFrame {
    startTime;
    startTimeOffset;
    endTime;
    duration;
    timeByCategory;
    cpuTime;
    idle;
    dropped;
    isPartial;
    layerTree;
    paints;
    mainFrameId;
    constructor(startTime, startTimeOffset) {
        this.startTime = startTime;
        this.startTimeOffset = startTimeOffset;
        this.endTime = this.startTime;
        this.duration = 0;
        this.timeByCategory = {};
        this.cpuTime = 0;
        this.idle = false;
        this.dropped = false;
        this.isPartial = false;
        this.layerTree = null;
        this.paints = [];
        this.mainFrameId = undefined;
    }
    hasWarnings() {
        return false;
    }
    setEndTime(endTime) {
        this.endTime = endTime;
        this.duration = this.endTime - this.startTime;
    }
    setLayerTree(layerTree) {
        this.layerTree = layerTree;
    }
    addTimeForCategories(timeByCategory) {
        for (const category in timeByCategory) {
            this.addTimeForCategory(category, timeByCategory[category]);
        }
    }
    addTimeForCategory(category, time) {
        this.timeByCategory[category] = (this.timeByCategory[category] || 0) + time;
        this.cpuTime += time;
    }
}
export class LayerPaintEvent {
    eventInternal;
    target;
    constructor(event, target) {
        this.eventInternal = event;
        this.target = target;
    }
    layerId() {
        return this.eventInternal.args['data']['layerId'];
    }
    event() {
        return this.eventInternal;
    }
    picturePromise() {
        const picture = TimelineData.forEvent(this.eventInternal).picture;
        if (!picture) {
            return Promise.resolve(null);
        }
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return picture.objectPromise().then((result) => {
            if (!result) {
                return null;
            }
            const rect = result['params'] && result['params']['layer_rect'];
            const picture = result['skp64'];
            return rect && picture ? { rect: rect, serializedPicture: picture } : null;
        });
    }
    async snapshotPromise() {
        const paintProfilerModel = this.target && this.target.model(SDK.PaintProfiler.PaintProfilerModel);
        const picture = await this.picturePromise();
        if (!picture || !paintProfilerModel) {
            return null;
        }
        const snapshot = await paintProfilerModel.loadSnapshot(picture.serializedPicture);
        return snapshot ? { rect: picture.rect, snapshot: snapshot } : null;
    }
}
export class PendingFrame {
    timeByCategory;
    paints;
    mainFrameId;
    triggerTime;
    constructor(triggerTime, timeByCategory) {
        this.timeByCategory = timeByCategory;
        this.paints = [];
        this.mainFrameId = undefined;
        this.triggerTime = triggerTime;
    }
}
// The parameters of an impl-side BeginFrame.
class BeginFrameInfo {
    seqId;
    startTime;
    isDropped;
    isPartial;
    constructor(seqId, startTime, isDropped, isPartial) {
        this.seqId = seqId;
        this.startTime = startTime;
        this.isDropped = isDropped;
        this.isPartial = isPartial;
    }
}
// A queue of BeginFrames pending visualization.
// BeginFrames are added into this queue as they occur; later when their
// corresponding DrawFrames occur (or lack thereof), the BeginFrames are removed
// from the queue and their timestamps are used for visualization.
export class TimelineFrameBeginFrameQueue {
    queueFrames;
    // Maps frameSeqId to BeginFrameInfo.
    mapFrames;
    constructor() {
        this.queueFrames = [];
        this.mapFrames = {};
    }
    // Add a BeginFrame to the queue, if it does not already exit.
    addFrameIfNotExists(seqId, startTime, isDropped, isPartial) {
        if (!(seqId in this.mapFrames)) {
            this.mapFrames[seqId] = new BeginFrameInfo(seqId, startTime, isDropped, isPartial);
            this.queueFrames.push(seqId);
        }
    }
    // Set a BeginFrame in queue as dropped.
    setDropped(seqId, isDropped) {
        if (seqId in this.mapFrames) {
            this.mapFrames[seqId].isDropped = isDropped;
        }
    }
    setPartial(seqId, isPartial) {
        if (seqId in this.mapFrames) {
            this.mapFrames[seqId].isPartial = isPartial;
        }
    }
    processPendingBeginFramesOnDrawFrame(seqId) {
        const framesToVisualize = [];
        // Do not visualize this frame in the rare case where the current DrawFrame
        // does not have a corresponding BeginFrame.
        if (seqId in this.mapFrames) {
            // Pop all BeginFrames before the current frame, and add only the dropped
            // ones in |frames_to_visualize|.
            // Non-dropped frames popped here are BeginFrames that are never
            // drawn (but not considered dropped either for some reason).
            // Those frames do not require an proactive visualization effort and will
            // be naturally presented as continuationss of other frames.
            while (this.queueFrames[0] !== seqId) {
                const currentSeqId = this.queueFrames[0];
                if (this.mapFrames[currentSeqId].isDropped) {
                    framesToVisualize.push(this.mapFrames[currentSeqId]);
                }
                delete this.mapFrames[currentSeqId];
                this.queueFrames.shift();
            }
            // Pop the BeginFrame associated with the current DrawFrame.
            framesToVisualize.push(this.mapFrames[seqId]);
            delete this.mapFrames[seqId];
            this.queueFrames.shift();
        }
        return framesToVisualize;
    }
}
//# sourceMappingURL=TimelineFrameModel.js.map
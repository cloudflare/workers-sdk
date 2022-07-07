// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as PerfUI from '../../ui/legacy/components/perf_ui/perf_ui.js';
import * as UI from '../../ui/legacy/legacy.js';
export class HeapTimelineOverview extends Common.ObjectWrapper.eventMixin(UI.Widget.VBox) {
    overviewCalculator;
    overviewContainer;
    overviewGrid;
    overviewCanvas;
    windowLeft;
    windowRight;
    yScale;
    xScale;
    profileSamples;
    running;
    updateOverviewCanvas;
    updateGridTimerId;
    updateTimerId;
    windowWidth;
    constructor() {
        super();
        this.element.id = 'heap-recording-view';
        this.element.classList.add('heap-tracking-overview');
        this.overviewCalculator = new OverviewCalculator();
        this.overviewContainer = this.element.createChild('div', 'heap-overview-container');
        this.overviewGrid = new PerfUI.OverviewGrid.OverviewGrid('heap-recording', this.overviewCalculator);
        this.overviewGrid.element.classList.add('fill');
        this.overviewCanvas =
            this.overviewContainer.createChild('canvas', 'heap-recording-overview-canvas');
        this.overviewContainer.appendChild(this.overviewGrid.element);
        this.overviewGrid.addEventListener(PerfUI.OverviewGrid.Events.WindowChanged, this.onWindowChanged, this);
        this.windowLeft = 0.0;
        this.windowRight = 1.0;
        this.overviewGrid.setWindow(this.windowLeft, this.windowRight);
        this.yScale = new SmoothScale();
        this.xScale = new SmoothScale();
        this.profileSamples = new Samples();
    }
    start() {
        this.running = true;
        const drawFrame = () => {
            this.update();
            if (this.running) {
                this.element.window().requestAnimationFrame(drawFrame);
            }
        };
        drawFrame();
    }
    stop() {
        this.running = false;
    }
    setSamples(samples) {
        this.profileSamples = samples;
        if (!this.running) {
            this.update();
        }
    }
    drawOverviewCanvas(width, height) {
        if (!this.profileSamples) {
            return;
        }
        const profileSamples = this.profileSamples;
        const sizes = profileSamples.sizes;
        const topSizes = profileSamples.max;
        const timestamps = profileSamples.timestamps;
        const startTime = timestamps[0];
        const scaleFactor = this.xScale.nextScale(width / profileSamples.totalTime);
        let maxSize = 0;
        function aggregateAndCall(sizes, callback) {
            let size = 0;
            let currentX = 0;
            for (let i = 1; i < timestamps.length; ++i) {
                const x = Math.floor((timestamps[i] - startTime) * scaleFactor);
                if (x !== currentX) {
                    if (size) {
                        callback(currentX, size);
                    }
                    size = 0;
                    currentX = x;
                }
                size += sizes[i];
            }
            callback(currentX, size);
        }
        function maxSizeCallback(x, size) {
            maxSize = Math.max(maxSize, size);
        }
        aggregateAndCall(sizes, maxSizeCallback);
        const yScaleFactor = this.yScale.nextScale(maxSize ? height / (maxSize * 1.1) : 0.0);
        this.overviewCanvas.width = width * window.devicePixelRatio;
        this.overviewCanvas.height = height * window.devicePixelRatio;
        this.overviewCanvas.style.width = width + 'px';
        this.overviewCanvas.style.height = height + 'px';
        const maybeContext = this.overviewCanvas.getContext('2d');
        if (!maybeContext) {
            throw new Error('Failed to get canvas context');
        }
        const context = maybeContext;
        context.scale(window.devicePixelRatio, window.devicePixelRatio);
        if (this.running) {
            context.beginPath();
            context.lineWidth = 2;
            context.strokeStyle = 'rgba(192, 192, 192, 0.6)';
            const currentX = (Date.now() - startTime) * scaleFactor;
            context.moveTo(currentX, height - 1);
            context.lineTo(currentX, 0);
            context.stroke();
            context.closePath();
        }
        let gridY = 0;
        let gridValue;
        const gridLabelHeight = 14;
        if (yScaleFactor) {
            const maxGridValue = (height - gridLabelHeight) / yScaleFactor;
            // The round value calculation is a bit tricky, because
            // it has a form k*10^n*1024^m, where k=[1,5], n=[0..3], m is an integer,
            // e.g. a round value 10KB is 10240 bytes.
            gridValue = Math.pow(1024, Math.floor(Math.log(maxGridValue) / Math.log(1024)));
            gridValue *= Math.pow(10, Math.floor(Math.log(maxGridValue / gridValue) / Math.LN10));
            if (gridValue * 5 <= maxGridValue) {
                gridValue *= 5;
            }
            gridY = Math.round(height - gridValue * yScaleFactor - 0.5) + 0.5;
            context.beginPath();
            context.lineWidth = 1;
            context.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            context.moveTo(0, gridY);
            context.lineTo(width, gridY);
            context.stroke();
            context.closePath();
        }
        function drawBarCallback(x, size) {
            context.moveTo(x, height - 1);
            context.lineTo(x, Math.round(height - size * yScaleFactor - 1));
        }
        context.beginPath();
        context.lineWidth = 2;
        context.strokeStyle = 'rgba(192, 192, 192, 0.6)';
        aggregateAndCall(topSizes, drawBarCallback);
        context.stroke();
        context.closePath();
        context.beginPath();
        context.lineWidth = 2;
        context.strokeStyle = 'rgba(0, 0, 192, 0.8)';
        aggregateAndCall(sizes, drawBarCallback);
        context.stroke();
        context.closePath();
        if (gridValue) {
            const label = Platform.NumberUtilities.bytesToString(gridValue);
            const labelPadding = 4;
            const labelX = 0;
            const labelY = gridY - 0.5;
            const labelWidth = 2 * labelPadding + context.measureText(label).width;
            context.beginPath();
            context.textBaseline = 'bottom';
            context.font = '10px ' + window.getComputedStyle(this.element, null).getPropertyValue('font-family');
            context.fillStyle = 'rgba(255, 255, 255, 0.75)';
            context.fillRect(labelX, labelY - gridLabelHeight, labelWidth, gridLabelHeight);
            context.fillStyle = 'rgb(64, 64, 64)';
            context.fillText(label, labelX + labelPadding, labelY);
            context.fill();
            context.closePath();
        }
    }
    onResize() {
        this.updateOverviewCanvas = true;
        this.scheduleUpdate();
    }
    onWindowChanged() {
        if (!this.updateGridTimerId) {
            this.updateGridTimerId = window.setTimeout(this.updateGrid.bind(this), 10);
        }
    }
    scheduleUpdate() {
        if (this.updateTimerId) {
            return;
        }
        this.updateTimerId = window.setTimeout(this.update.bind(this), 10);
    }
    updateBoundaries() {
        this.windowLeft = this.overviewGrid.windowLeft();
        this.windowRight = this.overviewGrid.windowRight();
        this.windowWidth = this.windowRight - this.windowLeft;
    }
    update() {
        this.updateTimerId = null;
        if (!this.isShowing()) {
            return;
        }
        this.updateBoundaries();
        this.overviewCalculator.updateBoundaries(this);
        this.overviewGrid.updateDividers(this.overviewCalculator);
        this.drawOverviewCanvas(this.overviewContainer.clientWidth, this.overviewContainer.clientHeight - 20);
    }
    updateGrid() {
        this.updateGridTimerId = 0;
        this.updateBoundaries();
        const ids = this.profileSamples.ids;
        if (!ids.length) {
            return;
        }
        const timestamps = this.profileSamples.timestamps;
        const sizes = this.profileSamples.sizes;
        const startTime = timestamps[0];
        const totalTime = this.profileSamples.totalTime;
        const timeLeft = startTime + totalTime * this.windowLeft;
        const timeRight = startTime + totalTime * this.windowRight;
        const minIndex = Platform.ArrayUtilities.lowerBound(timestamps, timeLeft, Platform.ArrayUtilities.DEFAULT_COMPARATOR);
        const maxIndex = Platform.ArrayUtilities.upperBound(timestamps, timeRight, Platform.ArrayUtilities.DEFAULT_COMPARATOR);
        let size = 0;
        for (let i = minIndex; i < maxIndex; ++i) {
            size += sizes[i];
        }
        const minId = minIndex > 0 ? ids[minIndex - 1] : 0;
        const maxId = maxIndex < ids.length ? ids[maxIndex] : Infinity;
        this.dispatchEventToListeners("IdsRangeChanged" /* IdsRangeChanged */, { minId, maxId, size });
    }
}
export class SmoothScale {
    lastUpdate;
    currentScale;
    constructor() {
        this.lastUpdate = 0;
        this.currentScale = 0.0;
    }
    nextScale(target) {
        target = target || this.currentScale;
        if (this.currentScale) {
            const now = Date.now();
            const timeDeltaMs = now - this.lastUpdate;
            this.lastUpdate = now;
            const maxChangePerSec = 20;
            const maxChangePerDelta = Math.pow(maxChangePerSec, timeDeltaMs / 1000);
            const scaleChange = target / this.currentScale;
            this.currentScale *= Platform.NumberUtilities.clamp(scaleChange, 1 / maxChangePerDelta, maxChangePerDelta);
        }
        else {
            this.currentScale = target;
        }
        return this.currentScale;
    }
}
export class Samples {
    sizes;
    ids;
    timestamps;
    max;
    totalTime;
    constructor() {
        this.sizes = [];
        this.ids = [];
        this.timestamps = [];
        this.max = [];
        this.totalTime = 30000;
    }
}
export class OverviewCalculator {
    maximumBoundaries;
    minimumBoundaries;
    xScaleFactor;
    constructor() {
        this.maximumBoundaries = 0;
        this.minimumBoundaries = 0;
        this.xScaleFactor = 0;
    }
    updateBoundaries(chart) {
        this.minimumBoundaries = 0;
        this.maximumBoundaries = chart.profileSamples.totalTime;
        this.xScaleFactor = chart.overviewContainer.clientWidth / this.maximumBoundaries;
    }
    computePosition(time) {
        return (time - this.minimumBoundaries) * this.xScaleFactor;
    }
    formatValue(value, precision) {
        return i18n.TimeUtilities.secondsToString(value / 1000, Boolean(precision));
    }
    maximumBoundary() {
        return this.maximumBoundaries;
    }
    minimumBoundary() {
        return this.minimumBoundaries;
    }
    zeroTime() {
        return this.minimumBoundaries;
    }
    boundarySpan() {
        return this.maximumBoundaries - this.minimumBoundaries;
    }
}
//# sourceMappingURL=HeapTimelineOverview.js.map
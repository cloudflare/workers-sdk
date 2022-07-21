/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as TimelineModel from '../../models/timeline_model/timeline_model.js';
import * as PerfUI from '../../ui/legacy/components/perf_ui/perf_ui.js';
import * as UI from '../../ui/legacy/legacy.js';
import { Events } from './PerformanceModel.js';
const UIStrings = {
    /**
    *@description Text for a heap profile type
    */
    jsHeap: 'JS Heap',
    /**
    *@description Text for documents, a type of resources
    */
    documents: 'Documents',
    /**
    *@description Text in Counters Graph of the Performance panel
    */
    nodes: 'Nodes',
    /**
    *@description Text in Counters Graph of the Performance panel
    */
    listeners: 'Listeners',
    /**
    *@description Text in Counters Graph of the Performance panel
    */
    gpuMemory: 'GPU Memory',
    /**
    *@description Range text content in Counters Graph of the Performance panel
    *@example {2} PH1
    *@example {10} PH2
    */
    ss: '[{PH1} – {PH2}]',
};
const str_ = i18n.i18n.registerUIStrings('panels/timeline/CountersGraph.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class CountersGraph extends UI.Widget.VBox {
    delegate;
    calculator;
    model;
    header;
    toolbar;
    graphsContainer;
    canvasContainer;
    canvas;
    timelineGrid;
    counters;
    counterUI;
    countersByName;
    gpuMemoryCounter;
    track;
    currentValuesBar;
    markerXPosition;
    constructor(delegate) {
        super();
        this.element.id = 'memory-graphs-container';
        this.delegate = delegate;
        this.calculator = new Calculator();
        // Create selectors
        this.header = new UI.Widget.HBox();
        this.header.element.classList.add('timeline-memory-header');
        this.header.show(this.element);
        this.toolbar = new UI.Toolbar.Toolbar('timeline-memory-toolbar');
        this.header.element.appendChild(this.toolbar.element);
        this.graphsContainer = new UI.Widget.VBox();
        this.graphsContainer.show(this.element);
        const canvasWidget = new UI.Widget.VBoxWithResizeCallback(this.resize.bind(this));
        canvasWidget.show(this.graphsContainer.element);
        this.createCurrentValuesBar();
        this.canvasContainer = canvasWidget.element;
        this.canvasContainer.id = 'memory-graphs-canvas-container';
        this.canvas = document.createElement('canvas');
        this.canvasContainer.appendChild(this.canvas);
        this.canvas.id = 'memory-counters-graph';
        this.canvasContainer.addEventListener('mouseover', this.onMouseMove.bind(this), true);
        this.canvasContainer.addEventListener('mousemove', this.onMouseMove.bind(this), true);
        this.canvasContainer.addEventListener('mouseleave', this.onMouseLeave.bind(this), true);
        this.canvasContainer.addEventListener('click', this.onClick.bind(this), true);
        // We create extra timeline grid here to reuse its event dividers.
        this.timelineGrid = new PerfUI.TimelineGrid.TimelineGrid();
        this.canvasContainer.appendChild(this.timelineGrid.dividersElement);
        this.counters = [];
        this.counterUI = [];
        this.countersByName = new Map();
        this.countersByName.set('jsHeapSizeUsed', this.createCounter(i18nString(UIStrings.jsHeap), 'hsl(220, 90%, 43%)', Platform.NumberUtilities.bytesToString));
        this.countersByName.set('documents', this.createCounter(i18nString(UIStrings.documents), 'hsl(0, 90%, 43%)'));
        this.countersByName.set('nodes', this.createCounter(i18nString(UIStrings.nodes), 'hsl(120, 90%, 43%)'));
        this.countersByName.set('jsEventListeners', this.createCounter(i18nString(UIStrings.listeners), 'hsl(38, 90%, 43%)'));
        this.gpuMemoryCounter = this.createCounter(i18nString(UIStrings.gpuMemory), 'hsl(300, 90%, 43%)', Platform.NumberUtilities.bytesToString);
        this.countersByName.set('gpuMemoryUsedKB', this.gpuMemoryCounter);
    }
    setModel(model, track) {
        if (this.model !== model) {
            if (this.model) {
                this.model.removeEventListener(Events.WindowChanged, this.onWindowChanged, this);
            }
            this.model = model;
            if (this.model) {
                this.model.addEventListener(Events.WindowChanged, this.onWindowChanged, this);
            }
        }
        this.calculator.setZeroTime(model ? model.timelineModel().minimumRecordTime() : 0);
        for (let i = 0; i < this.counters.length; ++i) {
            this.counters[i].reset();
            this.counterUI[i].reset();
        }
        this.scheduleRefresh();
        this.track = track;
        if (!track) {
            return;
        }
        const events = track.syncEvents();
        for (let i = 0; i < events.length; ++i) {
            const event = events[i];
            if (event.name !== TimelineModel.TimelineModel.RecordType.UpdateCounters) {
                continue;
            }
            const counters = event.args.data;
            if (!counters) {
                return;
            }
            for (const name in counters) {
                const counter = this.countersByName.get(name);
                if (counter) {
                    counter.appendSample(event.startTime, counters[name]);
                }
            }
            const gpuMemoryLimitCounterName = 'gpuMemoryLimitKB';
            if (gpuMemoryLimitCounterName in counters) {
                this.gpuMemoryCounter.setLimit(counters[gpuMemoryLimitCounterName]);
            }
        }
    }
    createCurrentValuesBar() {
        this.currentValuesBar = this.graphsContainer.element.createChild('div');
        this.currentValuesBar.id = 'counter-values-bar';
    }
    createCounter(uiName, color, formatter) {
        const counter = new Counter();
        this.counters.push(counter);
        this.counterUI.push(new CounterUI(this, uiName, color, counter, formatter));
        return counter;
    }
    resizerElement() {
        return this.header.element;
    }
    resize() {
        const parentElement = this.canvas.parentElement;
        this.canvas.width = parentElement.clientWidth * window.devicePixelRatio;
        this.canvas.height = parentElement.clientHeight * window.devicePixelRatio;
        this.calculator.setDisplayWidth(this.canvas.width);
        this.refresh();
    }
    onWindowChanged(event) {
        const window = event.data.window;
        this.calculator.setWindow(window.left, window.right);
        this.scheduleRefresh();
    }
    scheduleRefresh() {
        UI.UIUtils.invokeOnceAfterBatchUpdate(this, this.refresh);
    }
    draw() {
        this.clear();
        for (const counter of this.counters) {
            counter.calculateVisibleIndexes(this.calculator);
            counter.calculateXValues(this.canvas.width);
        }
        for (const counterUI of this.counterUI) {
            counterUI.drawGraph(this.canvas);
        }
    }
    onClick(event) {
        const x = event.x - this.canvasContainer.totalOffsetLeft();
        let minDistance = Infinity;
        let bestTime;
        for (const counterUI of this.counterUI) {
            if (!counterUI.counter.times.length) {
                continue;
            }
            const index = counterUI.recordIndexAt(x);
            const distance = Math.abs(x * window.devicePixelRatio - counterUI.counter.x[index]);
            if (distance < minDistance) {
                minDistance = distance;
                bestTime = counterUI.counter.times[index];
            }
        }
        if (bestTime !== undefined && this.track) {
            this.delegate.selectEntryAtTime(this.track.events.length ? this.track.events : this.track.asyncEvents, bestTime);
        }
    }
    onMouseLeave(_event) {
        delete this.markerXPosition;
        this.clearCurrentValueAndMarker();
    }
    clearCurrentValueAndMarker() {
        for (let i = 0; i < this.counterUI.length; i++) {
            this.counterUI[i].clearCurrentValueAndMarker();
        }
    }
    onMouseMove(event) {
        const x = event.x - this.canvasContainer.totalOffsetLeft();
        this.markerXPosition = x;
        this.refreshCurrentValues();
    }
    refreshCurrentValues() {
        if (this.markerXPosition === undefined) {
            return;
        }
        for (let i = 0; i < this.counterUI.length; ++i) {
            this.counterUI[i].updateCurrentValue(this.markerXPosition);
        }
    }
    refresh() {
        this.timelineGrid.updateDividers(this.calculator);
        this.draw();
        this.refreshCurrentValues();
    }
    clear() {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Unable to get canvas context');
        }
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
}
export class Counter {
    times;
    values;
    x;
    minimumIndex;
    maximumIndex;
    maxTime;
    minTime;
    limitValue;
    constructor() {
        this.times = [];
        this.values = [];
        this.x = [];
        this.minimumIndex = 0;
        this.maximumIndex = 0;
        this.maxTime = 0;
        this.minTime = 0;
    }
    appendSample(time, value) {
        if (this.values.length && this.values[this.values.length - 1] === value) {
            return;
        }
        this.times.push(time);
        this.values.push(value);
    }
    reset() {
        this.times = [];
        this.values = [];
    }
    setLimit(value) {
        this.limitValue = value;
    }
    calculateBounds() {
        let maxValue;
        let minValue;
        for (let i = this.minimumIndex; i <= this.maximumIndex; i++) {
            const value = this.values[i];
            if (minValue === undefined || value < minValue) {
                minValue = value;
            }
            if (maxValue === undefined || value > maxValue) {
                maxValue = value;
            }
        }
        minValue = minValue || 0;
        maxValue = maxValue || 1;
        if (this.limitValue) {
            if (maxValue > this.limitValue * 0.5) {
                maxValue = Math.max(maxValue, this.limitValue);
            }
            minValue = Math.min(minValue, this.limitValue);
        }
        return { min: minValue, max: maxValue };
    }
    calculateVisibleIndexes(calculator) {
        const start = calculator.minimumBoundary();
        const end = calculator.maximumBoundary();
        // Maximum index of element whose time <= start.
        this.minimumIndex = Platform.NumberUtilities.clamp(Platform.ArrayUtilities.upperBound(this.times, start, Platform.ArrayUtilities.DEFAULT_COMPARATOR) - 1, 0, this.times.length - 1);
        // Minimum index of element whose time >= end.
        this.maximumIndex = Platform.NumberUtilities.clamp(Platform.ArrayUtilities.lowerBound(this.times, end, Platform.ArrayUtilities.DEFAULT_COMPARATOR), 0, this.times.length - 1);
        // Current window bounds.
        this.minTime = start;
        this.maxTime = end;
    }
    calculateXValues(width) {
        if (!this.values.length) {
            return;
        }
        const xFactor = width / (this.maxTime - this.minTime);
        this.x = new Array(this.values.length);
        for (let i = this.minimumIndex + 1; i <= this.maximumIndex; i++) {
            this.x[i] = xFactor * (this.times[i] - this.minTime);
        }
    }
}
export class CounterUI {
    countersPane;
    counter;
    formatter;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setting;
    filter;
    range;
    value;
    graphColor;
    limitColor;
    graphYValues;
    verticalPadding;
    currentValueLabel;
    marker;
    constructor(countersPane, title, graphColor, counter, formatter) {
        this.countersPane = countersPane;
        this.counter = counter;
        this.formatter = formatter || Platform.NumberUtilities.withThousandsSeparator;
        this.setting = Common.Settings.Settings.instance().createSetting('timelineCountersGraph-' + title, true);
        this.setting.setTitle(title);
        this.filter = new UI.Toolbar.ToolbarSettingCheckbox(this.setting, title);
        this.filter.inputElement.classList.add('-theme-preserve-input');
        const parsedColor = Common.Color.Color.parse(graphColor);
        if (parsedColor) {
            const colorWithAlpha = parsedColor.setAlpha(0.5).asString(Common.Color.Format.RGBA);
            const htmlElement = this.filter.element;
            if (colorWithAlpha) {
                htmlElement.style.backgroundColor = colorWithAlpha;
            }
            htmlElement.style.borderColor = 'transparent';
        }
        this.filter.inputElement.addEventListener('click', this.toggleCounterGraph.bind(this));
        countersPane.toolbar.appendToolbarItem(this.filter);
        this.range = this.filter.element.createChild('span', 'range');
        this.value = countersPane.currentValuesBar.createChild('span', 'memory-counter-value');
        this.value.style.color = graphColor;
        this.graphColor = graphColor;
        if (parsedColor) {
            this.limitColor = parsedColor.setAlpha(0.3).asString(Common.Color.Format.RGBA);
        }
        this.graphYValues = [];
        this.verticalPadding = 10;
        this.currentValueLabel = title;
        this.marker = countersPane.canvasContainer.createChild('div', 'memory-counter-marker');
        this.marker.style.backgroundColor = graphColor;
        this.clearCurrentValueAndMarker();
    }
    reset() {
        this.range.textContent = '';
    }
    setRange(minValue, maxValue) {
        const min = this.formatter(minValue);
        const max = this.formatter(maxValue);
        this.range.textContent = i18nString(UIStrings.ss, { PH1: min, PH2: max });
    }
    toggleCounterGraph() {
        this.value.classList.toggle('hidden', !this.filter.checked());
        this.countersPane.refresh();
    }
    recordIndexAt(x) {
        return Platform.ArrayUtilities.upperBound(this.counter.x, x * window.devicePixelRatio, Platform.ArrayUtilities.DEFAULT_COMPARATOR, this.counter.minimumIndex + 1, this.counter.maximumIndex + 1) -
            1;
    }
    updateCurrentValue(x) {
        if (!this.visible() || !this.counter.values.length || !this.counter.x) {
            return;
        }
        const index = this.recordIndexAt(x);
        const value = Platform.NumberUtilities.withThousandsSeparator(this.counter.values[index]);
        this.value.textContent = `${this.currentValueLabel}: ${value}`;
        const y = this.graphYValues[index] / window.devicePixelRatio;
        this.marker.style.left = x + 'px';
        this.marker.style.top = y + 'px';
        this.marker.classList.remove('hidden');
    }
    clearCurrentValueAndMarker() {
        this.value.textContent = '';
        this.marker.classList.add('hidden');
    }
    drawGraph(canvas) {
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Unable to get canvas context');
        }
        const width = canvas.width;
        const height = canvas.height - 2 * this.verticalPadding;
        if (height <= 0) {
            this.graphYValues = [];
            return;
        }
        const originY = this.verticalPadding;
        const counter = this.counter;
        const values = counter.values;
        if (!values.length) {
            return;
        }
        const bounds = counter.calculateBounds();
        const minValue = bounds.min;
        const maxValue = bounds.max;
        this.setRange(minValue, maxValue);
        if (!this.visible()) {
            return;
        }
        const yValues = this.graphYValues;
        const maxYRange = maxValue - minValue;
        const yFactor = maxYRange ? height / (maxYRange) : 1;
        ctx.save();
        ctx.lineWidth = window.devicePixelRatio;
        if (ctx.lineWidth % 2) {
            ctx.translate(0.5, 0.5);
        }
        ctx.beginPath();
        let value = values[counter.minimumIndex];
        let currentY = Math.round(originY + height - (value - minValue) * yFactor);
        ctx.moveTo(0, currentY);
        let i = counter.minimumIndex;
        for (; i <= counter.maximumIndex; i++) {
            const x = Math.round(counter.x[i]);
            ctx.lineTo(x, currentY);
            const currentValue = values[i];
            if (typeof currentValue !== 'undefined') {
                value = currentValue;
            }
            currentY = Math.round(originY + height - (value - minValue) * yFactor);
            ctx.lineTo(x, currentY);
            yValues[i] = currentY;
        }
        yValues.length = i;
        ctx.lineTo(width, currentY);
        ctx.strokeStyle = this.graphColor;
        ctx.stroke();
        if (counter.limitValue) {
            const limitLineY = Math.round(originY + height - (counter.limitValue - minValue) * yFactor);
            ctx.moveTo(0, limitLineY);
            ctx.lineTo(width, limitLineY);
            if (this.limitColor) {
                ctx.strokeStyle = this.limitColor;
            }
            ctx.stroke();
        }
        ctx.closePath();
        ctx.restore();
    }
    visible() {
        return this.filter.checked();
    }
}
export class Calculator {
    minimumBoundaryInternal;
    maximumBoundaryInternal;
    workingArea;
    zeroTimeInternal;
    constructor() {
        this.minimumBoundaryInternal = 0;
        this.maximumBoundaryInternal = 0;
        this.workingArea = 0;
        this.zeroTimeInternal = 0;
    }
    setZeroTime(time) {
        this.zeroTimeInternal = time;
    }
    computePosition(time) {
        return (time - this.minimumBoundaryInternal) / this.boundarySpan() * this.workingArea;
    }
    setWindow(minimumBoundary, maximumBoundary) {
        this.minimumBoundaryInternal = minimumBoundary;
        this.maximumBoundaryInternal = maximumBoundary;
    }
    setDisplayWidth(clientWidth) {
        this.workingArea = clientWidth;
    }
    formatValue(value, precision) {
        return i18n.TimeUtilities.preciseMillisToString(value - this.zeroTime(), precision);
    }
    maximumBoundary() {
        return this.maximumBoundaryInternal;
    }
    minimumBoundary() {
        return this.minimumBoundaryInternal;
    }
    zeroTime() {
        return this.zeroTimeInternal;
    }
    boundarySpan() {
        return this.maximumBoundaryInternal - this.minimumBoundaryInternal;
    }
}
//# sourceMappingURL=CountersGraph.js.map
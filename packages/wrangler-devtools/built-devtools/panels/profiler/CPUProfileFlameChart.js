/**
 * Copyright (C) 2014 Google Inc. All rights reserved.
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
import * as Host from '../../core/host/host.js';
import * as Platform from '../../core/platform/platform.js';
import * as PerfUI from '../../ui/legacy/components/perf_ui/perf_ui.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as i18n from '../../core/i18n/i18n.js';
let colorGeneratorInstance = null;
export class ProfileFlameChartDataProvider {
    colorGeneratorInternal;
    maxStackDepthInternal;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    timelineData_;
    entryNodes;
    font;
    boldFont;
    constructor() {
        this.colorGeneratorInternal = ProfileFlameChartDataProvider.colorGenerator();
        this.maxStackDepthInternal = 0;
        this.timelineData_ = null;
        this.entryNodes = [];
    }
    static colorGenerator() {
        if (!colorGeneratorInstance) {
            colorGeneratorInstance = new Common.Color.Generator({ min: 30, max: 330, count: undefined }, { min: 50, max: 80, count: 5 }, { min: 80, max: 90, count: 3 });
            colorGeneratorInstance.setColorForID('(idle)', 'hsl(0, 0%, 94%)');
            colorGeneratorInstance.setColorForID('(program)', 'hsl(0, 0%, 80%)');
            colorGeneratorInstance.setColorForID('(garbage collector)', 'hsl(0, 0%, 80%)');
        }
        return colorGeneratorInstance;
    }
    minimumBoundary() {
        throw 'Not implemented.';
    }
    totalTime() {
        throw 'Not implemented.';
    }
    formatValue(value, precision) {
        return i18n.TimeUtilities.preciseMillisToString(value, precision);
    }
    maxStackDepth() {
        return this.maxStackDepthInternal;
    }
    timelineData() {
        return this.timelineData_ || this.calculateTimelineData();
    }
    calculateTimelineData() {
        throw 'Not implemented.';
    }
    prepareHighlightedEntryInfo(_entryIndex) {
        throw 'Not implemented.';
    }
    canJumpToEntry(entryIndex) {
        return this.entryNodes[entryIndex].scriptId !== '0';
    }
    entryTitle(entryIndex) {
        const node = this.entryNodes[entryIndex];
        return UI.UIUtils.beautifyFunctionName(node.functionName);
    }
    entryFont(entryIndex) {
        if (!this.font) {
            this.font = '11px ' + Host.Platform.fontFamily();
            this.boldFont = 'bold ' + this.font;
        }
        return this.entryHasDeoptReason(entryIndex) ? this.boldFont : this.font;
    }
    entryHasDeoptReason(_entryIndex) {
        throw 'Not implemented.';
    }
    entryColor(entryIndex) {
        const node = this.entryNodes[entryIndex];
        // For idle and program, we want different 'shades of gray', so we fallback to functionName as scriptId = 0
        // For rest of nodes e.g eval scripts, if url is empty then scriptId will be guaranteed to be non-zero
        return this.colorGeneratorInternal.colorForID(node.url || (node.scriptId !== '0' ? node.scriptId : node.functionName));
    }
    decorateEntry(_entryIndex, _context, _text, _barX, _barY, _barWidth, _barHeight) {
        return false;
    }
    forceDecoration(_entryIndex) {
        return false;
    }
    textColor(_entryIndex) {
        return '#333';
    }
    navStartTimes() {
        return new Map();
    }
    entryNodesLength() {
        return this.entryNodes.length;
    }
}
export class CPUProfileFlameChart extends Common.ObjectWrapper.eventMixin(UI.Widget.VBox) {
    searchableView;
    overviewPane;
    mainPane;
    entrySelected;
    dataProvider;
    searchResults;
    searchResultIndex = -1;
    constructor(searchableView, dataProvider) {
        super();
        this.element.id = 'cpu-flame-chart';
        this.searchableView = searchableView;
        this.overviewPane = new OverviewPane(dataProvider);
        this.overviewPane.show(this.element);
        this.mainPane = new PerfUI.FlameChart.FlameChart(dataProvider, this.overviewPane);
        this.mainPane.setBarHeight(15);
        this.mainPane.setTextBaseline(4);
        this.mainPane.setTextPadding(2);
        this.mainPane.show(this.element);
        this.mainPane.addEventListener(PerfUI.FlameChart.Events.EntrySelected, this.onEntrySelected, this);
        this.mainPane.addEventListener(PerfUI.FlameChart.Events.EntryInvoked, this.onEntryInvoked, this);
        this.entrySelected = false;
        this.mainPane.addEventListener(PerfUI.FlameChart.Events.CanvasFocused, this.onEntrySelected, this);
        this.overviewPane.addEventListener("WindowChanged" /* WindowChanged */, this.onWindowChanged, this);
        this.dataProvider = dataProvider;
        this.searchResults = [];
    }
    focus() {
        this.mainPane.focus();
    }
    onWindowChanged(event) {
        const { windowTimeLeft: windowLeft, windowTimeRight: windowRight } = event.data;
        this.mainPane.setWindowTimes(windowLeft, windowRight, /* animate */ true);
    }
    selectRange(timeLeft, timeRight) {
        this.overviewPane.selectRange(timeLeft, timeRight);
    }
    onEntrySelected(event) {
        if (event.data) {
            const eventIndex = event.data;
            this.mainPane.setSelectedEntry(eventIndex);
            if (eventIndex === -1) {
                this.entrySelected = false;
            }
            else {
                this.entrySelected = true;
            }
        }
        else if (!this.entrySelected) {
            this.mainPane.setSelectedEntry(0);
            this.entrySelected = true;
        }
    }
    onEntryInvoked(event) {
        this.onEntrySelected(event);
        this.dispatchEventToListeners(PerfUI.FlameChart.Events.EntryInvoked, event.data);
    }
    update() {
        this.overviewPane.update();
        this.mainPane.update();
    }
    performSearch(searchConfig, _shouldJump, jumpBackwards) {
        const matcher = Platform.StringUtilities.createPlainTextSearchRegex(searchConfig.query, searchConfig.caseSensitive ? '' : 'i');
        const selectedEntryIndex = this.searchResultIndex !== -1 ? this.searchResults[this.searchResultIndex] : -1;
        this.searchResults = [];
        const entriesCount = this.dataProvider.entryNodesLength();
        for (let index = 0; index < entriesCount; ++index) {
            if (this.dataProvider.entryTitle(index).match(matcher)) {
                this.searchResults.push(index);
            }
        }
        if (this.searchResults.length) {
            this.searchResultIndex = this.searchResults.indexOf(selectedEntryIndex);
            if (this.searchResultIndex === -1) {
                this.searchResultIndex = jumpBackwards ? this.searchResults.length - 1 : 0;
            }
            this.mainPane.setSelectedEntry(this.searchResults[this.searchResultIndex]);
        }
        else {
            this.searchCanceled();
        }
        this.searchableView.updateSearchMatchesCount(this.searchResults.length);
        this.searchableView.updateCurrentMatchIndex(this.searchResultIndex);
    }
    searchCanceled() {
        this.mainPane.setSelectedEntry(-1);
        this.searchResults = [];
        this.searchResultIndex = -1;
    }
    jumpToNextSearchResult() {
        this.searchResultIndex = (this.searchResultIndex + 1) % this.searchResults.length;
        this.mainPane.setSelectedEntry(this.searchResults[this.searchResultIndex]);
        this.searchableView.updateCurrentMatchIndex(this.searchResultIndex);
    }
    jumpToPreviousSearchResult() {
        this.searchResultIndex = (this.searchResultIndex - 1 + this.searchResults.length) % this.searchResults.length;
        this.mainPane.setSelectedEntry(this.searchResults[this.searchResultIndex]);
        this.searchableView.updateCurrentMatchIndex(this.searchResultIndex);
    }
    supportsCaseSensitiveSearch() {
        return true;
    }
    supportsRegexSearch() {
        return false;
    }
}
export class OverviewCalculator {
    formatter;
    minimumBoundaries;
    maximumBoundaries;
    xScaleFactor;
    constructor(formatter) {
        this.formatter = formatter;
    }
    updateBoundaries(overviewPane) {
        this.minimumBoundaries = overviewPane.dataProvider.minimumBoundary();
        const totalTime = overviewPane.dataProvider.totalTime();
        this.maximumBoundaries = this.minimumBoundaries + totalTime;
        this.xScaleFactor = overviewPane.overviewContainer.clientWidth / totalTime;
    }
    computePosition(time) {
        return (time - this.minimumBoundaries) * this.xScaleFactor;
    }
    formatValue(value, precision) {
        return this.formatter(value - this.minimumBoundaries, precision);
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
export class OverviewPane extends Common.ObjectWrapper.eventMixin(UI.Widget.VBox) {
    overviewContainer;
    overviewCalculator;
    overviewGrid;
    overviewCanvas;
    dataProvider;
    windowTimeLeft;
    windowTimeRight;
    updateTimerId;
    constructor(dataProvider) {
        super();
        this.element.classList.add('cpu-profile-flame-chart-overview-pane');
        this.overviewContainer = this.element.createChild('div', 'cpu-profile-flame-chart-overview-container');
        this.overviewCalculator = new OverviewCalculator(dataProvider.formatValue);
        this.overviewGrid = new PerfUI.OverviewGrid.OverviewGrid('cpu-profile-flame-chart', this.overviewCalculator);
        this.overviewGrid.element.classList.add('fill');
        this.overviewCanvas =
            this.overviewContainer.createChild('canvas', 'cpu-profile-flame-chart-overview-canvas');
        this.overviewContainer.appendChild(this.overviewGrid.element);
        this.dataProvider = dataProvider;
        this.overviewGrid.addEventListener(PerfUI.OverviewGrid.Events.WindowChangedWithPosition, this.onWindowChanged, this);
    }
    windowChanged(windowStartTime, windowEndTime) {
        this.selectRange(windowStartTime, windowEndTime);
    }
    updateRangeSelection(_startTime, _endTime) {
    }
    updateSelectedGroup(_flameChart, _group) {
    }
    selectRange(timeLeft, timeRight) {
        const startTime = this.dataProvider.minimumBoundary();
        const totalTime = this.dataProvider.totalTime();
        this.overviewGrid.setWindow((timeLeft - startTime) / totalTime, (timeRight - startTime) / totalTime);
    }
    onWindowChanged(event) {
        const windowPosition = { windowTimeLeft: event.data.rawStartValue, windowTimeRight: event.data.rawEndValue };
        this.windowTimeLeft = windowPosition.windowTimeLeft;
        this.windowTimeRight = windowPosition.windowTimeRight;
        this.dispatchEventToListeners("WindowChanged" /* WindowChanged */, windowPosition);
    }
    timelineData() {
        return this.dataProvider.timelineData();
    }
    onResize() {
        this.scheduleUpdate();
    }
    scheduleUpdate() {
        if (this.updateTimerId) {
            return;
        }
        this.updateTimerId = this.element.window().requestAnimationFrame(this.update.bind(this));
    }
    update() {
        this.updateTimerId = 0;
        const timelineData = this.timelineData();
        if (!timelineData) {
            return;
        }
        this.resetCanvas(this.overviewContainer.clientWidth, this.overviewContainer.clientHeight - PerfUI.FlameChart.HeaderHeight);
        this.overviewCalculator.updateBoundaries(this);
        this.overviewGrid.updateDividers(this.overviewCalculator);
        this.drawOverviewCanvas();
    }
    drawOverviewCanvas() {
        const canvasWidth = this.overviewCanvas.width;
        const canvasHeight = this.overviewCanvas.height;
        const drawData = this.calculateDrawData(canvasWidth);
        const context = this.overviewCanvas.getContext('2d');
        if (!context) {
            throw new Error('Failed to get canvas context');
        }
        const ratio = window.devicePixelRatio;
        const offsetFromBottom = ratio;
        const lineWidth = 1;
        const yScaleFactor = canvasHeight / (this.dataProvider.maxStackDepth() * 1.1);
        context.lineWidth = lineWidth;
        context.translate(0.5, 0.5);
        context.strokeStyle = 'rgba(20,0,0,0.4)';
        context.fillStyle = 'rgba(214,225,254,0.8)';
        context.moveTo(-lineWidth, canvasHeight + lineWidth);
        context.lineTo(-lineWidth, Math.round(canvasHeight - drawData[0] * yScaleFactor - offsetFromBottom));
        let value = 0;
        for (let x = 0; x < canvasWidth; ++x) {
            value = Math.round(canvasHeight - drawData[x] * yScaleFactor - offsetFromBottom);
            context.lineTo(x, value);
        }
        context.lineTo(canvasWidth + lineWidth, value);
        context.lineTo(canvasWidth + lineWidth, canvasHeight + lineWidth);
        context.fill();
        context.stroke();
        context.closePath();
    }
    calculateDrawData(width) {
        const dataProvider = this.dataProvider;
        const timelineData = this.timelineData();
        const entryStartTimes = timelineData.entryStartTimes;
        const entryTotalTimes = timelineData.entryTotalTimes;
        const entryLevels = timelineData.entryLevels;
        const length = entryStartTimes.length;
        const minimumBoundary = this.dataProvider.minimumBoundary();
        const drawData = new Uint8Array(width);
        const scaleFactor = width / dataProvider.totalTime();
        for (let entryIndex = 0; entryIndex < length; ++entryIndex) {
            const start = Math.floor((entryStartTimes[entryIndex] - minimumBoundary) * scaleFactor);
            const finish = Math.floor((entryStartTimes[entryIndex] - minimumBoundary + entryTotalTimes[entryIndex]) * scaleFactor);
            for (let x = start; x <= finish; ++x) {
                drawData[x] = Math.max(drawData[x], entryLevels[entryIndex] + 1);
            }
        }
        return drawData;
    }
    resetCanvas(width, height) {
        const ratio = window.devicePixelRatio;
        this.overviewCanvas.width = width * ratio;
        this.overviewCanvas.height = height * ratio;
        this.overviewCanvas.style.width = width + 'px';
        this.overviewCanvas.style.height = height + 'px';
    }
}
//# sourceMappingURL=CPUProfileFlameChart.js.map
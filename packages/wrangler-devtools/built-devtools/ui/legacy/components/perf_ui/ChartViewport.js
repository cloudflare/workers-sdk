// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../../../core/common/common.js';
import * as i18n from '../../../../core/i18n/i18n.js';
import * as Platform from '../../../../core/platform/platform.js';
import * as UI from '../../legacy.js';
import chartViewPortStyles from './chartViewport.css.legacy.js';
import { MinimalTimeWindowMs } from './FlameChart.js';
export class ChartViewport extends UI.Widget.VBox {
    delegate;
    viewportElement;
    alwaysShowVerticalScrollInternal;
    rangeSelectionEnabled;
    vScrollElement;
    vScrollContent;
    selectionOverlay;
    selectedTimeSpanLabel;
    cursorElement;
    isDraggingInternal;
    totalHeight;
    offsetHeight;
    scrollTop;
    rangeSelectionStart;
    rangeSelectionEnd;
    dragStartPointX;
    dragStartPointY;
    dragStartScrollTop;
    visibleLeftTime;
    visibleRightTime;
    offsetWidth;
    targetLeftTime;
    targetRightTime;
    selectionOffsetShiftX;
    selectionOffsetShiftY;
    selectionStartX;
    lastMouseOffsetX;
    minimumBoundary;
    totalTime;
    updateTimerId;
    cancelWindowTimesAnimation;
    constructor(delegate) {
        super();
        this.registerRequiredCSS(chartViewPortStyles);
        this.delegate = delegate;
        this.viewportElement = this.contentElement.createChild('div', 'fill');
        this.viewportElement.addEventListener('mousemove', this.updateCursorPosition.bind(this), false);
        this.viewportElement.addEventListener('mouseout', this.onMouseOut.bind(this), false);
        this.viewportElement.addEventListener('wheel', this.onMouseWheel.bind(this), false);
        this.viewportElement.addEventListener('keydown', this.onChartKeyDown.bind(this), false);
        this.viewportElement.addEventListener('keyup', this.onChartKeyUp.bind(this), false);
        UI.UIUtils.installDragHandle(this.viewportElement, this.startDragging.bind(this), this.dragging.bind(this), this.endDragging.bind(this), '-webkit-grabbing', null);
        UI.UIUtils.installDragHandle(this.viewportElement, this.startRangeSelection.bind(this), this.rangeSelectionDragging.bind(this), this.endRangeSelection.bind(this), 'text', null);
        this.alwaysShowVerticalScrollInternal = false;
        this.rangeSelectionEnabled = true;
        this.vScrollElement = this.contentElement.createChild('div', 'chart-viewport-v-scroll');
        this.vScrollContent = this.vScrollElement.createChild('div');
        this.vScrollElement.addEventListener('scroll', this.onScroll.bind(this), false);
        this.selectionOverlay = this.contentElement.createChild('div', 'chart-viewport-selection-overlay hidden');
        this.selectedTimeSpanLabel = this.selectionOverlay.createChild('div', 'time-span');
        this.cursorElement = this.contentElement.createChild('div', 'chart-cursor-element hidden');
        this.reset();
        this.rangeSelectionStart = null;
        this.rangeSelectionEnd = null;
    }
    alwaysShowVerticalScroll() {
        this.alwaysShowVerticalScrollInternal = true;
        this.vScrollElement.classList.add('always-show-scrollbar');
    }
    disableRangeSelection() {
        this.rangeSelectionEnabled = false;
        this.rangeSelectionStart = null;
        this.rangeSelectionEnd = null;
        this.updateRangeSelectionOverlay();
    }
    isDragging() {
        return this.isDraggingInternal;
    }
    elementsToRestoreScrollPositionsFor() {
        return [this.vScrollElement];
    }
    updateScrollBar() {
        const showScroll = this.alwaysShowVerticalScrollInternal || this.totalHeight > this.offsetHeight;
        if (this.vScrollElement.classList.contains('hidden') !== showScroll) {
            return;
        }
        this.vScrollElement.classList.toggle('hidden', !showScroll);
        this.updateContentElementSize();
    }
    onResize() {
        this.updateScrollBar();
        this.updateContentElementSize();
        this.scheduleUpdate();
    }
    reset() {
        this.vScrollElement.scrollTop = 0;
        this.scrollTop = 0;
        this.rangeSelectionStart = null;
        this.rangeSelectionEnd = null;
        this.isDraggingInternal = false;
        this.dragStartPointX = 0;
        this.dragStartPointY = 0;
        this.dragStartScrollTop = 0;
        this.visibleLeftTime = 0;
        this.visibleRightTime = 0;
        this.offsetWidth = 0;
        this.offsetHeight = 0;
        this.totalHeight = 0;
        this.targetLeftTime = 0;
        this.targetRightTime = 0;
        this.updateContentElementSize();
    }
    updateContentElementSize() {
        let offsetWidth = this.vScrollElement.offsetLeft;
        if (!offsetWidth) {
            offsetWidth = this.contentElement.offsetWidth;
        }
        this.offsetWidth = offsetWidth;
        this.offsetHeight = this.contentElement.offsetHeight;
        this.delegate.setSize(this.offsetWidth, this.offsetHeight);
    }
    setContentHeight(totalHeight) {
        this.totalHeight = totalHeight;
        this.vScrollContent.style.height = totalHeight + 'px';
        this.updateScrollBar();
        this.updateContentElementSize();
        if (this.scrollTop + this.offsetHeight <= totalHeight) {
            return;
        }
        this.scrollTop = Math.max(0, totalHeight - this.offsetHeight);
        this.vScrollElement.scrollTop = this.scrollTop;
    }
    setScrollOffset(offset, height) {
        height = height || 0;
        if (this.vScrollElement.scrollTop > offset) {
            this.vScrollElement.scrollTop = offset;
        }
        else if (this.vScrollElement.scrollTop < offset - this.offsetHeight + height) {
            this.vScrollElement.scrollTop = offset - this.offsetHeight + height;
        }
    }
    scrollOffset() {
        return this.vScrollElement.scrollTop;
    }
    chartHeight() {
        return this.offsetHeight;
    }
    setBoundaries(zeroTime, totalTime) {
        this.minimumBoundary = zeroTime;
        this.totalTime = totalTime;
    }
    onMouseWheel(e) {
        const wheelEvent = e;
        const doZoomInstead = wheelEvent.shiftKey !==
            (Common.Settings.Settings.instance().moduleSetting('flamechartMouseWheelAction').get() === 'zoom');
        const panVertically = !doZoomInstead && (wheelEvent.deltaY || Math.abs(wheelEvent.deltaX) === 53);
        const panHorizontally = doZoomInstead && Math.abs(wheelEvent.deltaX) > Math.abs(wheelEvent.deltaY);
        if (panVertically) {
            this.vScrollElement.scrollTop += (wheelEvent.deltaY || wheelEvent.deltaX) / 53 * this.offsetHeight / 8;
        }
        else if (panHorizontally) {
            this.handlePanGesture(wheelEvent.deltaX, /* animate */ true);
        }
        else { // Zoom.
            const wheelZoomSpeed = 1 / 53;
            this.handleZoomGesture(Math.pow(1.2, (wheelEvent.deltaY || wheelEvent.deltaX) * wheelZoomSpeed) - 1);
        }
        // Block swipe gesture.
        e.consume(true);
    }
    startDragging(event) {
        if (event.shiftKey) {
            return false;
        }
        this.isDraggingInternal = true;
        this.dragStartPointX = event.pageX;
        this.dragStartPointY = event.pageY;
        this.dragStartScrollTop = this.vScrollElement.scrollTop;
        this.viewportElement.style.cursor = '';
        return true;
    }
    dragging(event) {
        const pixelShift = this.dragStartPointX - event.pageX;
        this.dragStartPointX = event.pageX;
        this.handlePanGesture(pixelShift);
        const pixelScroll = this.dragStartPointY - event.pageY;
        this.vScrollElement.scrollTop = this.dragStartScrollTop + pixelScroll;
    }
    endDragging() {
        this.isDraggingInternal = false;
    }
    startRangeSelection(event) {
        if (!event.shiftKey || !this.rangeSelectionEnabled) {
            return false;
        }
        this.isDraggingInternal = true;
        this.selectionOffsetShiftX = event.offsetX - event.pageX;
        this.selectionOffsetShiftY = event.offsetY - event.pageY;
        this.selectionStartX = event.offsetX;
        const style = this.selectionOverlay.style;
        style.left = this.selectionStartX + 'px';
        style.width = '1px';
        this.selectedTimeSpanLabel.textContent = '';
        this.selectionOverlay.classList.remove('hidden');
        return true;
    }
    endRangeSelection() {
        this.isDraggingInternal = false;
        this.selectionStartX = null;
    }
    hideRangeSelection() {
        this.selectionOverlay.classList.add('hidden');
        this.rangeSelectionStart = null;
        this.rangeSelectionEnd = null;
    }
    setRangeSelection(startTime, endTime) {
        if (!this.rangeSelectionEnabled) {
            return;
        }
        this.rangeSelectionStart = Math.min(startTime, endTime);
        this.rangeSelectionEnd = Math.max(startTime, endTime);
        this.updateRangeSelectionOverlay();
        this.delegate.updateRangeSelection(this.rangeSelectionStart, this.rangeSelectionEnd);
    }
    onClick(event) {
        const mouseEvent = event;
        const time = this.pixelToTime(mouseEvent.offsetX);
        if (this.rangeSelectionStart !== null && this.rangeSelectionEnd !== null && time >= this.rangeSelectionStart &&
            time <= this.rangeSelectionEnd) {
            return;
        }
        this.hideRangeSelection();
    }
    rangeSelectionDragging(event) {
        const x = Platform.NumberUtilities.clamp(event.pageX + this.selectionOffsetShiftX, 0, this.offsetWidth);
        const start = this.pixelToTime(this.selectionStartX || 0);
        const end = this.pixelToTime(x);
        this.setRangeSelection(start, end);
    }
    updateRangeSelectionOverlay() {
        const rangeSelectionStart = this.rangeSelectionStart || 0;
        const rangeSelectionEnd = this.rangeSelectionEnd || 0;
        const margin = 100;
        const left = Platform.NumberUtilities.clamp(this.timeToPosition(rangeSelectionStart), -margin, this.offsetWidth + margin);
        const right = Platform.NumberUtilities.clamp(this.timeToPosition(rangeSelectionEnd), -margin, this.offsetWidth + margin);
        const style = this.selectionOverlay.style;
        style.left = left + 'px';
        style.width = (right - left) + 'px';
        const timeSpan = rangeSelectionEnd - rangeSelectionStart;
        this.selectedTimeSpanLabel.textContent = i18n.TimeUtilities.preciseMillisToString(timeSpan, 2);
    }
    onScroll() {
        this.scrollTop = this.vScrollElement.scrollTop;
        this.scheduleUpdate();
    }
    onMouseOut() {
        this.lastMouseOffsetX = -1;
        this.showCursor(false);
    }
    updateCursorPosition(e) {
        const mouseEvent = e;
        this.showCursor(mouseEvent.shiftKey);
        this.cursorElement.style.left = mouseEvent.offsetX + 'px';
        this.lastMouseOffsetX = mouseEvent.offsetX;
    }
    pixelToTime(x) {
        return this.pixelToTimeOffset(x) + this.visibleLeftTime;
    }
    pixelToTimeOffset(x) {
        return x * (this.visibleRightTime - this.visibleLeftTime) / this.offsetWidth;
    }
    timeToPosition(time) {
        return Math.floor((time - this.visibleLeftTime) / (this.visibleRightTime - this.visibleLeftTime) * this.offsetWidth);
    }
    timeToPixel() {
        return this.offsetWidth / (this.visibleRightTime - this.visibleLeftTime);
    }
    showCursor(visible) {
        this.cursorElement.classList.toggle('hidden', !visible || this.isDraggingInternal);
    }
    onChartKeyDown(e) {
        const mouseEvent = e;
        this.showCursor(mouseEvent.shiftKey);
        this.handleZoomPanKeys(e);
    }
    onChartKeyUp(e) {
        const mouseEvent = e;
        this.showCursor(mouseEvent.shiftKey);
    }
    handleZoomPanKeys(e) {
        if (!UI.KeyboardShortcut.KeyboardShortcut.hasNoModifiers(e)) {
            return;
        }
        const keyboardEvent = e;
        const zoomFactor = keyboardEvent.shiftKey ? 0.8 : 0.3;
        const panOffset = keyboardEvent.shiftKey ? 320 : 160;
        switch (keyboardEvent.code) {
            case 'KeyA':
                this.handlePanGesture(-panOffset, /* animate */ true);
                break;
            case 'KeyD':
                this.handlePanGesture(panOffset, /* animate */ true);
                break;
            case 'KeyW':
                this.handleZoomGesture(-zoomFactor);
                break;
            case 'KeyS':
                this.handleZoomGesture(zoomFactor);
                break;
            default:
                return;
        }
        e.consume(true);
    }
    handleZoomGesture(zoom) {
        const bounds = { left: this.targetLeftTime, right: this.targetRightTime };
        const cursorTime = this.pixelToTime(this.lastMouseOffsetX);
        bounds.left += (bounds.left - cursorTime) * zoom;
        bounds.right += (bounds.right - cursorTime) * zoom;
        this.requestWindowTimes(bounds, /* animate */ true);
    }
    handlePanGesture(offset, animate) {
        const bounds = { left: this.targetLeftTime, right: this.targetRightTime };
        const timeOffset = Platform.NumberUtilities.clamp(this.pixelToTimeOffset(offset), this.minimumBoundary - bounds.left, this.totalTime + this.minimumBoundary - bounds.right);
        bounds.left += timeOffset;
        bounds.right += timeOffset;
        this.requestWindowTimes(bounds, Boolean(animate));
    }
    requestWindowTimes(bounds, animate) {
        const maxBound = this.minimumBoundary + this.totalTime;
        if (bounds.left < this.minimumBoundary) {
            bounds.right = Math.min(bounds.right + this.minimumBoundary - bounds.left, maxBound);
            bounds.left = this.minimumBoundary;
        }
        else if (bounds.right > maxBound) {
            bounds.left = Math.max(bounds.left - bounds.right + maxBound, this.minimumBoundary);
            bounds.right = maxBound;
        }
        if (bounds.right - bounds.left < MinimalTimeWindowMs) {
            return;
        }
        this.delegate.windowChanged(bounds.left, bounds.right, animate);
    }
    scheduleUpdate() {
        if (this.updateTimerId || this.cancelWindowTimesAnimation) {
            return;
        }
        this.updateTimerId = this.element.window().requestAnimationFrame(() => {
            this.updateTimerId = 0;
            this.update();
        });
    }
    update() {
        this.updateRangeSelectionOverlay();
        this.delegate.update();
    }
    setWindowTimes(startTime, endTime, animate) {
        if (startTime === this.targetLeftTime && endTime === this.targetRightTime) {
            return;
        }
        if (!animate || this.visibleLeftTime === 0 || this.visibleRightTime === Infinity ||
            (startTime === 0 && endTime === Infinity) || (startTime === Infinity && endTime === Infinity)) {
            // Skip animation, move instantly.
            this.targetLeftTime = startTime;
            this.targetRightTime = endTime;
            this.visibleLeftTime = startTime;
            this.visibleRightTime = endTime;
            this.scheduleUpdate();
            return;
        }
        if (this.cancelWindowTimesAnimation) {
            this.cancelWindowTimesAnimation();
            this.visibleLeftTime = this.targetLeftTime;
            this.visibleRightTime = this.targetRightTime;
        }
        this.targetLeftTime = startTime;
        this.targetRightTime = endTime;
        this.cancelWindowTimesAnimation = UI.UIUtils.animateFunction(this.element.window(), animateWindowTimes.bind(this), [{ from: this.visibleLeftTime, to: startTime }, { from: this.visibleRightTime, to: endTime }], 100, () => {
            this.cancelWindowTimesAnimation = null;
        });
        function animateWindowTimes(startTime, endTime) {
            this.visibleLeftTime = startTime;
            this.visibleRightTime = endTime;
            this.update();
        }
    }
    windowLeftTime() {
        return this.visibleLeftTime;
    }
    windowRightTime() {
        return this.visibleRightTime;
    }
}
//# sourceMappingURL=ChartViewport.js.map
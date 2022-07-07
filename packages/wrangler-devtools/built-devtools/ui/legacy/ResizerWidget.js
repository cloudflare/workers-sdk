// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import { elementDragStart } from './UIUtils.js';
export class ResizerWidget extends Common.ObjectWrapper.ObjectWrapper {
    isEnabledInternal;
    elementsInternal;
    installDragOnMouseDownBound;
    cursorInternal;
    startX;
    startY;
    constructor() {
        super();
        this.isEnabledInternal = true;
        this.elementsInternal = new Set();
        this.installDragOnMouseDownBound = this.installDragOnMouseDown.bind(this);
        this.cursorInternal = 'nwse-resize';
    }
    isEnabled() {
        return this.isEnabledInternal;
    }
    setEnabled(enabled) {
        this.isEnabledInternal = enabled;
        this.updateElementCursors();
    }
    elements() {
        return [...this.elementsInternal];
    }
    addElement(element) {
        if (!this.elementsInternal.has(element)) {
            this.elementsInternal.add(element);
            element.addEventListener('pointerdown', this.installDragOnMouseDownBound, false);
            this.updateElementCursor(element);
        }
    }
    removeElement(element) {
        if (this.elementsInternal.has(element)) {
            this.elementsInternal.delete(element);
            element.removeEventListener('pointerdown', this.installDragOnMouseDownBound, false);
            element.style.removeProperty('cursor');
        }
    }
    updateElementCursors() {
        this.elementsInternal.forEach(this.updateElementCursor.bind(this));
    }
    updateElementCursor(element) {
        if (this.isEnabledInternal) {
            element.style.setProperty('cursor', this.cursor());
            element.style.setProperty('touch-action', 'none');
        }
        else {
            element.style.removeProperty('cursor');
            element.style.removeProperty('touch-action');
        }
    }
    cursor() {
        return this.cursorInternal;
    }
    setCursor(cursor) {
        this.cursorInternal = cursor;
        this.updateElementCursors();
    }
    installDragOnMouseDown(event) {
        const element = event.target;
        // Only handle drags of the nodes specified.
        if (!this.elementsInternal.has(element)) {
            return false;
        }
        elementDragStart(element, this.dragStart.bind(this), event => {
            this.drag(event);
        }, this.dragEnd.bind(this), this.cursor(), event);
        return undefined;
    }
    dragStart(event) {
        if (!this.isEnabledInternal) {
            return false;
        }
        this.startX = event.pageX;
        this.startY = event.pageY;
        this.sendDragStart(this.startX, this.startY);
        return true;
    }
    sendDragStart(x, y) {
        this.dispatchEventToListeners(Events.ResizeStart, { startX: x, currentX: x, startY: y, currentY: y });
    }
    drag(event) {
        if (!this.isEnabledInternal) {
            this.dragEnd(event);
            return true; // Cancel drag.
        }
        this.sendDragMove(this.startX, event.pageX, this.startY, event.pageY, event.shiftKey);
        event.preventDefault();
        return false; // Continue drag.
    }
    sendDragMove(startX, currentX, startY, currentY, shiftKey) {
        this.dispatchEventToListeners(Events.ResizeUpdateXY, { startX: startX, currentX: currentX, startY: startY, currentY: currentY, shiftKey: shiftKey });
    }
    dragEnd(_event) {
        this.dispatchEventToListeners(Events.ResizeEnd);
        delete this.startX;
        delete this.startY;
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["ResizeStart"] = "ResizeStart";
    Events["ResizeUpdateXY"] = "ResizeUpdateXY";
    Events["ResizeUpdatePosition"] = "ResizeUpdatePosition";
    Events["ResizeEnd"] = "ResizeEnd";
})(Events || (Events = {}));
export class SimpleResizerWidget extends ResizerWidget {
    isVerticalInternal;
    constructor() {
        super();
        this.isVerticalInternal = true;
    }
    isVertical() {
        return this.isVerticalInternal;
    }
    /**
     * Vertical widget resizes height (along y-axis).
     */
    setVertical(vertical) {
        this.isVerticalInternal = vertical;
        this.updateElementCursors();
    }
    cursor() {
        return this.isVerticalInternal ? 'ns-resize' : 'ew-resize';
    }
    sendDragStart(x, y) {
        const position = this.isVerticalInternal ? y : x;
        this.dispatchEventToListeners(Events.ResizeStart, { startPosition: position, currentPosition: position });
    }
    sendDragMove(startX, currentX, startY, currentY, shiftKey) {
        if (this.isVerticalInternal) {
            this.dispatchEventToListeners(Events.ResizeUpdatePosition, { startPosition: startY, currentPosition: currentY, shiftKey: shiftKey });
        }
        else {
            this.dispatchEventToListeners(Events.ResizeUpdatePosition, { startPosition: startX, currentPosition: currentX, shiftKey: shiftKey });
        }
    }
}
//# sourceMappingURL=ResizerWidget.js.map
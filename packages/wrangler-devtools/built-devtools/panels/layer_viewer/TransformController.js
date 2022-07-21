// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as UI from '../../ui/legacy/legacy.js';
const UIStrings = {
    /**
    *@description Tooltip text that appears when hovering over largeicon pan button in Transform Controller of the Layers panel
    */
    panModeX: 'Pan mode (X)',
    /**
    *@description Tooltip text that appears when hovering over largeicon rotate button in Transform Controller of the Layers panel
    */
    rotateModeV: 'Rotate mode (V)',
    /**
    *@description Tooltip text that appears when hovering over the largeicon center button in the Transform Controller of the Layers panel
    */
    resetTransform: 'Reset transform (0)',
};
const str_ = i18n.i18n.registerUIStrings('panels/layer_viewer/TransformController.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class TransformController extends Common.ObjectWrapper.ObjectWrapper {
    mode;
    scaleInternal;
    offsetXInternal;
    offsetYInternal;
    rotateXInternal;
    rotateYInternal;
    oldRotateX;
    oldRotateY;
    originX;
    originY;
    element;
    minScale;
    maxScale;
    controlPanelToolbar;
    modeButtons;
    constructor(element, disableRotate) {
        super();
        this.scaleInternal = 1;
        this.offsetXInternal = 0;
        this.offsetYInternal = 0;
        this.rotateXInternal = 0;
        this.rotateYInternal = 0;
        this.oldRotateX = 0;
        this.oldRotateY = 0;
        this.originX = 0;
        this.originY = 0;
        this.element = element;
        this.registerShortcuts();
        UI.UIUtils.installDragHandle(element, this.onDragStart.bind(this), this.onDrag.bind(this), this.onDragEnd.bind(this), 'move', null);
        element.addEventListener('wheel', this.onMouseWheel.bind(this), false);
        this.minScale = 0;
        this.maxScale = Infinity;
        this.controlPanelToolbar = new UI.Toolbar.Toolbar('transform-control-panel');
        this.modeButtons = {};
        if (!disableRotate) {
            const panModeButton = new UI.Toolbar.ToolbarToggle(i18nString(UIStrings.panModeX), 'largeicon-pan');
            panModeButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.setMode.bind(this, "Pan" /* Pan */));
            this.modeButtons["Pan" /* Pan */] = panModeButton;
            this.controlPanelToolbar.appendToolbarItem(panModeButton);
            const rotateModeButton = new UI.Toolbar.ToolbarToggle(i18nString(UIStrings.rotateModeV), 'largeicon-rotate');
            rotateModeButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.setMode.bind(this, "Rotate" /* Rotate */));
            this.modeButtons["Rotate" /* Rotate */] = rotateModeButton;
            this.controlPanelToolbar.appendToolbarItem(rotateModeButton);
        }
        this.setMode("Pan" /* Pan */);
        const resetButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.resetTransform), 'largeicon-center');
        resetButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this.resetAndNotify.bind(this, undefined));
        this.controlPanelToolbar.appendToolbarItem(resetButton);
        this.reset();
    }
    toolbar() {
        return this.controlPanelToolbar;
    }
    registerShortcuts() {
        const zoomFactor = 1.1;
        UI.ShortcutRegistry.ShortcutRegistry.instance().addShortcutListener(this.element, {
            'layers.reset-view': async () => {
                this.resetAndNotify();
                return true;
            },
            'layers.pan-mode': async () => {
                this.setMode("Pan" /* Pan */);
                return true;
            },
            'layers.rotate-mode': async () => {
                this.setMode("Rotate" /* Rotate */);
                return true;
            },
            'layers.zoom-in': this.onKeyboardZoom.bind(this, zoomFactor),
            'layers.zoom-out': this.onKeyboardZoom.bind(this, 1 / zoomFactor),
            'layers.up': this.onKeyboardPanOrRotate.bind(this, 0, -1),
            'layers.down': this.onKeyboardPanOrRotate.bind(this, 0, 1),
            'layers.left': this.onKeyboardPanOrRotate.bind(this, -1, 0),
            'layers.right': this.onKeyboardPanOrRotate.bind(this, 1, 0),
        });
    }
    postChangeEvent() {
        this.dispatchEventToListeners(Events.TransformChanged);
    }
    reset() {
        this.scaleInternal = 1;
        this.offsetXInternal = 0;
        this.offsetYInternal = 0;
        this.rotateXInternal = 0;
        this.rotateYInternal = 0;
    }
    setMode(mode) {
        if (this.mode === mode) {
            return;
        }
        this.mode = mode;
        this.updateModeButtons();
    }
    updateModeButtons() {
        for (const mode in this.modeButtons) {
            this.modeButtons[mode].setToggled(mode === this.mode);
        }
    }
    resetAndNotify(event) {
        this.reset();
        this.postChangeEvent();
        if (event) {
            event.preventDefault();
        }
        this.element.focus();
    }
    setScaleConstraints(minScale, maxScale) {
        this.minScale = minScale;
        this.maxScale = maxScale;
        this.scaleInternal = Platform.NumberUtilities.clamp(this.scaleInternal, minScale, maxScale);
    }
    clampOffsets(minX, maxX, minY, maxY) {
        this.offsetXInternal = Platform.NumberUtilities.clamp(this.offsetXInternal, minX, maxX);
        this.offsetYInternal = Platform.NumberUtilities.clamp(this.offsetYInternal, minY, maxY);
    }
    scale() {
        return this.scaleInternal;
    }
    offsetX() {
        return this.offsetXInternal;
    }
    offsetY() {
        return this.offsetYInternal;
    }
    rotateX() {
        return this.rotateXInternal;
    }
    rotateY() {
        return this.rotateYInternal;
    }
    onScale(scaleFactor, x, y) {
        scaleFactor = Platform.NumberUtilities.clamp(this.scaleInternal * scaleFactor, this.minScale, this.maxScale) /
            this.scaleInternal;
        this.scaleInternal *= scaleFactor;
        this.offsetXInternal -= (x - this.offsetXInternal) * (scaleFactor - 1);
        this.offsetYInternal -= (y - this.offsetYInternal) * (scaleFactor - 1);
        this.postChangeEvent();
    }
    onPan(offsetX, offsetY) {
        this.offsetXInternal += offsetX;
        this.offsetYInternal += offsetY;
        this.postChangeEvent();
    }
    onRotate(rotateX, rotateY) {
        this.rotateXInternal = rotateX;
        this.rotateYInternal = rotateY;
        this.postChangeEvent();
    }
    async onKeyboardZoom(zoomFactor) {
        this.onScale(zoomFactor, this.element.clientWidth / 2, this.element.clientHeight / 2);
        return true;
    }
    async onKeyboardPanOrRotate(xMultiplier, yMultiplier) {
        const panStepInPixels = 6;
        const rotateStepInDegrees = 5;
        if (this.mode === "Rotate" /* Rotate */) {
            // Sic! onRotate treats X and Y as "rotate around X" and "rotate around Y", so swap X/Y multiplers.
            this.onRotate(this.rotateXInternal + yMultiplier * rotateStepInDegrees, this.rotateYInternal + xMultiplier * rotateStepInDegrees);
        }
        else {
            this.onPan(xMultiplier * panStepInPixels, yMultiplier * panStepInPixels);
        }
        return true;
    }
    onMouseWheel(event) {
        /** @const */
        const zoomFactor = 1.1;
        /** @const */
        const wheelZoomSpeed = 1 / 53;
        const mouseEvent = event;
        const scaleFactor = Math.pow(zoomFactor, -mouseEvent.deltaY * wheelZoomSpeed);
        this.onScale(scaleFactor, mouseEvent.clientX - this.element.totalOffsetLeft(), mouseEvent.clientY - this.element.totalOffsetTop());
    }
    onDrag(event) {
        const { clientX, clientY } = event;
        if (this.mode === "Rotate" /* Rotate */) {
            this.onRotate(this.oldRotateX + (this.originY - clientY) / this.element.clientHeight * 180, this.oldRotateY - (this.originX - clientX) / this.element.clientWidth * 180);
        }
        else {
            this.onPan(clientX - this.originX, clientY - this.originY);
            this.originX = clientX;
            this.originY = clientY;
        }
    }
    onDragStart(event) {
        this.element.focus();
        this.originX = event.clientX;
        this.originY = event.clientY;
        this.oldRotateX = this.rotateXInternal;
        this.oldRotateY = this.rotateYInternal;
        return true;
    }
    onDragEnd() {
        this.originX = 0;
        this.originY = 0;
        this.oldRotateX = 0;
        this.oldRotateY = 0;
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Events;
(function (Events) {
    Events["TransformChanged"] = "TransformChanged";
})(Events || (Events = {}));
//# sourceMappingURL=TransformController.js.map
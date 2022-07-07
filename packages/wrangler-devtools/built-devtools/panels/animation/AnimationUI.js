// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as InlineEditor from '../../ui/legacy/components/inline_editor/inline_editor.js';
import * as UI from '../../ui/legacy/legacy.js';
import { StepTimingFunction } from './AnimationTimeline.js';
const UIStrings = {
    /**
    *@description Title of the first and last points of an animation
    */
    animationEndpointSlider: 'Animation Endpoint slider',
    /**
    *@description Title of an Animation Keyframe point
    */
    animationKeyframeSlider: 'Animation Keyframe slider',
    /**
    *@description Title of an animation keyframe group
    *@example {anilogo} PH1
    */
    sSlider: '{PH1} slider',
};
const str_ = i18n.i18n.registerUIStrings('panels/animation/AnimationUI.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class AnimationUI {
    #animationInternal;
    #timeline;
    #keyframes;
    #nameElement;
    #svg;
    #activeIntervalGroup;
    #cachedElements;
    #movementInMs;
    #keyboardMovementRateMs;
    #color;
    #node;
    #delayLine;
    #endDelayLine;
    #tailGroup;
    #mouseEventType;
    #keyframeMoved;
    #downMouseX;
    constructor(animation, timeline, parentElement) {
        this.#animationInternal = animation;
        this.#timeline = timeline;
        const keyframesRule = this.#animationInternal.source().keyframesRule();
        if (keyframesRule) {
            this.#keyframes = keyframesRule.keyframes();
        }
        this.#nameElement = parentElement.createChild('div', 'animation-name');
        this.#nameElement.textContent = this.#animationInternal.name();
        this.#svg = UI.UIUtils.createSVGChild(parentElement, 'svg', 'animation-ui');
        this.#svg.setAttribute('height', Options.AnimationSVGHeight.toString());
        this.#svg.style.marginLeft = '-' + Options.AnimationMargin + 'px';
        this.#svg.addEventListener('contextmenu', this.onContextMenu.bind(this));
        this.#activeIntervalGroup = UI.UIUtils.createSVGChild(this.#svg, 'g');
        UI.UIUtils.installDragHandle(this.#activeIntervalGroup, this.mouseDown.bind(this, "AnimationDrag" /* AnimationDrag */, null), this.mouseMove.bind(this), this.mouseUp.bind(this), '-webkit-grabbing', '-webkit-grab');
        AnimationUI.installDragHandleKeyboard(this.#activeIntervalGroup, this.keydownMove.bind(this, "AnimationDrag" /* AnimationDrag */, null));
        this.#cachedElements = [];
        this.#movementInMs = 0;
        this.#keyboardMovementRateMs = 50;
        this.#color = AnimationUI.colorForAnimation(this.#animationInternal);
    }
    static colorForAnimation(animation) {
        const names = Array.from(Colors.keys());
        const hashCode = Platform.StringUtilities.hashCode(animation.name() || animation.id());
        const cappedHashCode = hashCode % names.length;
        const colorName = names[cappedHashCode];
        const color = Colors.get(colorName);
        if (!color) {
            throw new Error('Unable to locate color');
        }
        return color.asString(Common.Color.Format.RGB) || '';
    }
    static installDragHandleKeyboard(element, elementDrag) {
        element.addEventListener('keydown', elementDrag, false);
    }
    animation() {
        return this.#animationInternal;
    }
    get nameElement() {
        return this.#nameElement;
    }
    get svg() {
        return this.#svg;
    }
    setNode(node) {
        this.#node = node;
    }
    createLine(parentElement, className) {
        const line = UI.UIUtils.createSVGChild(parentElement, 'line', className);
        line.setAttribute('x1', Options.AnimationMargin.toString());
        line.setAttribute('y1', Options.AnimationHeight.toString());
        line.setAttribute('y2', Options.AnimationHeight.toString());
        line.style.stroke = this.#color;
        return line;
    }
    drawAnimationLine(iteration, parentElement) {
        const cache = this.#cachedElements[iteration];
        if (!cache.animationLine) {
            cache.animationLine = this.createLine(parentElement, 'animation-line');
        }
        if (!cache.animationLine) {
            return;
        }
        cache.animationLine.setAttribute('x2', (this.duration() * this.#timeline.pixelMsRatio() + Options.AnimationMargin).toFixed(2));
    }
    drawDelayLine(parentElement) {
        if (!this.#delayLine || !this.#endDelayLine) {
            this.#delayLine = this.createLine(parentElement, 'animation-delay-line');
            this.#endDelayLine = this.createLine(parentElement, 'animation-delay-line');
        }
        const fill = this.#animationInternal.source().fill();
        this.#delayLine.classList.toggle('animation-fill', fill === 'backwards' || fill === 'both');
        const margin = Options.AnimationMargin;
        this.#delayLine.setAttribute('x1', margin.toString());
        this.#delayLine.setAttribute('x2', (this.delay() * this.#timeline.pixelMsRatio() + margin).toFixed(2));
        const forwardsFill = fill === 'forwards' || fill === 'both';
        this.#endDelayLine.classList.toggle('animation-fill', forwardsFill);
        const leftMargin = Math.min(this.#timeline.width(), (this.delay() + this.duration() * this.#animationInternal.source().iterations()) *
            this.#timeline.pixelMsRatio());
        this.#endDelayLine.style.transform = 'translateX(' + leftMargin.toFixed(2) + 'px)';
        this.#endDelayLine.setAttribute('x1', margin.toString());
        this.#endDelayLine.setAttribute('x2', forwardsFill ?
            (this.#timeline.width() - leftMargin + margin).toFixed(2) :
            (this.#animationInternal.source().endDelay() * this.#timeline.pixelMsRatio() + margin).toFixed(2));
    }
    drawPoint(iteration, parentElement, x, keyframeIndex, attachEvents) {
        if (this.#cachedElements[iteration].keyframePoints[keyframeIndex]) {
            this.#cachedElements[iteration].keyframePoints[keyframeIndex].setAttribute('cx', x.toFixed(2));
            return;
        }
        const circle = UI.UIUtils.createSVGChild(parentElement, 'circle', keyframeIndex <= 0 ? 'animation-endpoint' : 'animation-keyframe-point');
        circle.setAttribute('cx', x.toFixed(2));
        circle.setAttribute('cy', Options.AnimationHeight.toString());
        circle.style.stroke = this.#color;
        circle.setAttribute('r', (Options.AnimationMargin / 2).toString());
        circle.tabIndex = 0;
        UI.ARIAUtils.setAccessibleName(circle, keyframeIndex <= 0 ? i18nString(UIStrings.animationEndpointSlider) :
            i18nString(UIStrings.animationKeyframeSlider));
        if (keyframeIndex <= 0) {
            circle.style.fill = this.#color;
        }
        this.#cachedElements[iteration].keyframePoints[keyframeIndex] = circle;
        if (!attachEvents) {
            return;
        }
        let eventType;
        if (keyframeIndex === 0) {
            eventType = "StartEndpointMove" /* StartEndpointMove */;
        }
        else if (keyframeIndex === -1) {
            eventType = "FinishEndpointMove" /* FinishEndpointMove */;
        }
        else {
            eventType = "KeyframeMove" /* KeyframeMove */;
        }
        UI.UIUtils.installDragHandle(circle, this.mouseDown.bind(this, eventType, keyframeIndex), this.mouseMove.bind(this), this.mouseUp.bind(this), 'ew-resize');
        AnimationUI.installDragHandleKeyboard(circle, this.keydownMove.bind(this, eventType, keyframeIndex));
    }
    renderKeyframe(iteration, keyframeIndex, parentElement, leftDistance, width, easing) {
        function createStepLine(parentElement, x, strokeColor) {
            const line = UI.UIUtils.createSVGChild(parentElement, 'line');
            line.setAttribute('x1', x.toString());
            line.setAttribute('x2', x.toString());
            line.setAttribute('y1', Options.AnimationMargin.toString());
            line.setAttribute('y2', Options.AnimationHeight.toString());
            line.style.stroke = strokeColor;
        }
        const bezier = UI.Geometry.CubicBezier.parse(easing);
        const cache = this.#cachedElements[iteration].keyframeRender;
        if (!cache[keyframeIndex]) {
            const svg = bezier ? UI.UIUtils.createSVGChild(parentElement, 'path', 'animation-keyframe') :
                UI.UIUtils.createSVGChild(parentElement, 'g', 'animation-keyframe-step');
            cache[keyframeIndex] = svg;
        }
        const group = cache[keyframeIndex];
        group.tabIndex = 0;
        UI.ARIAUtils.setAccessibleName(group, i18nString(UIStrings.sSlider, { PH1: this.#animationInternal.name() }));
        group.style.transform = 'translateX(' + leftDistance.toFixed(2) + 'px)';
        if (easing === 'linear') {
            group.style.fill = this.#color;
            const height = InlineEditor.BezierUI.Height;
            group.setAttribute('d', ['M', 0, height, 'L', 0, 5, 'L', width.toFixed(2), 5, 'L', width.toFixed(2), height, 'Z'].join(' '));
        }
        else if (bezier) {
            group.style.fill = this.#color;
            InlineEditor.BezierUI.BezierUI.drawVelocityChart(bezier, group, width);
        }
        else {
            const stepFunction = StepTimingFunction.parse(easing);
            group.removeChildren();
            const offsetMap = { 'start': 0, 'middle': 0.5, 'end': 1 };
            if (stepFunction) {
                const offsetWeight = offsetMap[stepFunction.stepAtPosition];
                for (let i = 0; i < stepFunction.steps; i++) {
                    createStepLine(group, (i + offsetWeight) * width / stepFunction.steps, this.#color);
                }
            }
        }
    }
    redraw() {
        const maxWidth = this.#timeline.width() - Options.AnimationMargin;
        this.#svg.setAttribute('width', (maxWidth + 2 * Options.AnimationMargin).toFixed(2));
        this.#activeIntervalGroup.style.transform =
            'translateX(' + (this.delay() * this.#timeline.pixelMsRatio()).toFixed(2) + 'px)';
        this.#nameElement.style.transform =
            'translateX(' + (this.delay() * this.#timeline.pixelMsRatio() + Options.AnimationMargin).toFixed(2) + 'px)';
        this.#nameElement.style.width = (this.duration() * this.#timeline.pixelMsRatio()).toFixed(2) + 'px';
        this.drawDelayLine(this.#svg);
        if (this.#animationInternal.type() === 'CSSTransition') {
            this.renderTransition();
            return;
        }
        this.renderIteration(this.#activeIntervalGroup, 0);
        if (!this.#tailGroup) {
            this.#tailGroup = UI.UIUtils.createSVGChild(this.#activeIntervalGroup, 'g', 'animation-tail-iterations');
        }
        const iterationWidth = this.duration() * this.#timeline.pixelMsRatio();
        let iteration;
        for (iteration = 1; iteration < this.#animationInternal.source().iterations() &&
            iterationWidth * (iteration - 1) < this.#timeline.width() &&
            (iterationWidth > 0 || this.#animationInternal.source().iterations() !== Infinity); iteration++) {
            this.renderIteration(this.#tailGroup, iteration);
        }
        while (iteration < this.#cachedElements.length) {
            const poppedElement = this.#cachedElements.pop();
            if (poppedElement && poppedElement.group) {
                poppedElement.group.remove();
            }
        }
    }
    renderTransition() {
        const activeIntervalGroup = this.#activeIntervalGroup;
        if (!this.#cachedElements[0]) {
            this.#cachedElements[0] = { animationLine: null, keyframePoints: {}, keyframeRender: {}, group: null };
        }
        this.drawAnimationLine(0, activeIntervalGroup);
        this.renderKeyframe(0, 0, activeIntervalGroup, Options.AnimationMargin, this.duration() * this.#timeline.pixelMsRatio(), this.#animationInternal.source().easing());
        this.drawPoint(0, activeIntervalGroup, Options.AnimationMargin, 0, true);
        this.drawPoint(0, activeIntervalGroup, this.duration() * this.#timeline.pixelMsRatio() + Options.AnimationMargin, -1, true);
    }
    renderIteration(parentElement, iteration) {
        if (!this.#cachedElements[iteration]) {
            this.#cachedElements[iteration] = {
                animationLine: null,
                keyframePoints: {},
                keyframeRender: {},
                group: UI.UIUtils.createSVGChild(parentElement, 'g'),
            };
        }
        const group = this.#cachedElements[iteration].group;
        if (!group) {
            return;
        }
        group.style.transform =
            'translateX(' + (iteration * this.duration() * this.#timeline.pixelMsRatio()).toFixed(2) + 'px)';
        this.drawAnimationLine(iteration, group);
        if (this.#keyframes && this.#keyframes.length > 1) {
            for (let i = 0; i < this.#keyframes.length - 1; i++) {
                const leftDistance = this.offset(i) * this.duration() * this.#timeline.pixelMsRatio() + Options.AnimationMargin;
                const width = this.duration() * (this.offset(i + 1) - this.offset(i)) * this.#timeline.pixelMsRatio();
                this.renderKeyframe(iteration, i, group, leftDistance, width, this.#keyframes[i].easing());
                if (i || (!i && iteration === 0)) {
                    this.drawPoint(iteration, group, leftDistance, i, iteration === 0);
                }
            }
        }
        this.drawPoint(iteration, group, this.duration() * this.#timeline.pixelMsRatio() + Options.AnimationMargin, -1, iteration === 0);
    }
    delay() {
        let delay = this.#animationInternal.source().delay();
        if (this.#mouseEventType === "AnimationDrag" /* AnimationDrag */ || this.#mouseEventType === "StartEndpointMove" /* StartEndpointMove */) {
            delay += this.#movementInMs;
        }
        // FIXME: add support for negative start delay
        return Math.max(0, delay);
    }
    duration() {
        let duration = this.#animationInternal.source().duration();
        if (this.#mouseEventType === "FinishEndpointMove" /* FinishEndpointMove */) {
            duration += this.#movementInMs;
        }
        else if (this.#mouseEventType === "StartEndpointMove" /* StartEndpointMove */) {
            duration -= Math.max(this.#movementInMs, -this.#animationInternal.source().delay());
            // Cannot have negative delay
        }
        return Math.max(0, duration);
    }
    offset(i) {
        if (!this.#keyframes) {
            throw new Error('Unable to calculate offset; keyframes do not exist');
        }
        let offset = this.#keyframes[i].offsetAsNumber();
        if (this.#mouseEventType === "KeyframeMove" /* KeyframeMove */ && i === this.#keyframeMoved) {
            console.assert(i > 0 && i < this.#keyframes.length - 1, 'First and last keyframe cannot be moved');
            offset += this.#movementInMs / this.#animationInternal.source().duration();
            offset = Math.max(offset, this.#keyframes[i - 1].offsetAsNumber());
            offset = Math.min(offset, this.#keyframes[i + 1].offsetAsNumber());
        }
        return offset;
    }
    mouseDown(mouseEventType, keyframeIndex, event) {
        const mouseEvent = event;
        if (mouseEvent.buttons === 2) {
            return false;
        }
        if (this.#svg.enclosingNodeOrSelfWithClass('animation-node-removed')) {
            return false;
        }
        this.#mouseEventType = mouseEventType;
        this.#keyframeMoved = keyframeIndex;
        this.#downMouseX = mouseEvent.clientX;
        event.consume(true);
        if (this.#node) {
            void Common.Revealer.reveal(this.#node);
        }
        return true;
    }
    mouseMove(event) {
        const mouseEvent = event;
        this.setMovementAndRedraw((mouseEvent.clientX - (this.#downMouseX || 0)) / this.#timeline.pixelMsRatio());
    }
    setMovementAndRedraw(movement) {
        this.#movementInMs = movement;
        if (this.delay() + this.duration() > this.#timeline.duration() * 0.8) {
            this.#timeline.setDuration(this.#timeline.duration() * 1.2);
        }
        this.redraw();
    }
    mouseUp(event) {
        const mouseEvent = event;
        this.#movementInMs = (mouseEvent.clientX - (this.#downMouseX || 0)) / this.#timeline.pixelMsRatio();
        // Commit changes
        if (this.#mouseEventType === "KeyframeMove" /* KeyframeMove */) {
            if (this.#keyframes && this.#keyframeMoved !== null && typeof this.#keyframeMoved !== 'undefined') {
                this.#keyframes[this.#keyframeMoved].setOffset(this.offset(this.#keyframeMoved));
            }
        }
        else {
            this.#animationInternal.setTiming(this.duration(), this.delay());
        }
        this.#movementInMs = 0;
        this.redraw();
        this.#mouseEventType = undefined;
        this.#downMouseX = undefined;
        this.#keyframeMoved = undefined;
    }
    keydownMove(mouseEventType, keyframeIndex, event) {
        const keyboardEvent = event;
        this.#mouseEventType = mouseEventType;
        this.#keyframeMoved = keyframeIndex;
        switch (keyboardEvent.key) {
            case 'ArrowLeft':
            case 'ArrowUp':
                this.#movementInMs = -this.#keyboardMovementRateMs;
                break;
            case 'ArrowRight':
            case 'ArrowDown':
                this.#movementInMs = this.#keyboardMovementRateMs;
                break;
            default:
                return;
        }
        if (this.#mouseEventType === "KeyframeMove" /* KeyframeMove */) {
            if (this.#keyframes && this.#keyframeMoved !== null) {
                this.#keyframes[this.#keyframeMoved].setOffset(this.offset(this.#keyframeMoved));
            }
        }
        else {
            this.#animationInternal.setTiming(this.duration(), this.delay());
        }
        this.setMovementAndRedraw(0);
        this.#mouseEventType = undefined;
        this.#keyframeMoved = undefined;
        event.consume(true);
    }
    onContextMenu(event) {
        function showContextMenu(remoteObject) {
            if (!remoteObject) {
                return;
            }
            const contextMenu = new UI.ContextMenu.ContextMenu(event);
            contextMenu.appendApplicableItems(remoteObject);
            void contextMenu.show();
        }
        void this.#animationInternal.remoteObjectPromise().then(showContextMenu);
        event.consume(true);
    }
}
export const Options = {
    AnimationHeight: 26,
    AnimationSVGHeight: 50,
    AnimationMargin: 7,
    EndpointsClickRegionSize: 10,
    GridCanvasHeight: 40,
};
export const Colors = new Map([
    ['Purple', Common.Color.Color.parse('#9C27B0')],
    ['Light Blue', Common.Color.Color.parse('#03A9F4')],
    ['Deep Orange', Common.Color.Color.parse('#FF5722')],
    ['Blue', Common.Color.Color.parse('#5677FC')],
    ['Lime', Common.Color.Color.parse('#CDDC39')],
    ['Blue Grey', Common.Color.Color.parse('#607D8B')],
    ['Pink', Common.Color.Color.parse('#E91E63')],
    ['Green', Common.Color.Color.parse('#0F9D58')],
    ['Brown', Common.Color.Color.parse('#795548')],
    ['Cyan', Common.Color.Color.parse('#00BCD4')],
]);
//# sourceMappingURL=AnimationUI.js.map
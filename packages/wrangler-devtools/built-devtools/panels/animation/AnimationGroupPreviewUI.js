// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as UI from '../../ui/legacy/legacy.js';
import { AnimationUI } from './AnimationUI.js';
export class AnimationGroupPreviewUI {
    #model;
    element;
    #removeButtonInternal;
    #replayOverlayElement;
    #svg;
    #viewBoxHeight;
    constructor(model) {
        this.#model = model;
        this.element = document.createElement('div');
        this.element.classList.add('animation-buffer-preview');
        this.element.createChild('div', 'animation-paused fill');
        this.#removeButtonInternal = this.element.createChild('div', 'animation-remove-button');
        this.#removeButtonInternal.textContent = '\u2715';
        this.#replayOverlayElement = this.element.createChild('div', 'animation-buffer-preview-animation');
        this.#svg = UI.UIUtils.createSVGChild(this.element, 'svg');
        this.#svg.setAttribute('width', '100%');
        this.#svg.setAttribute('preserveAspectRatio', 'none');
        this.#svg.setAttribute('height', '100%');
        this.#viewBoxHeight = 32;
        this.#svg.setAttribute('viewBox', '0 0 100 ' + this.#viewBoxHeight);
        this.#svg.setAttribute('shape-rendering', 'crispEdges');
        this.render();
    }
    groupDuration() {
        let duration = 0;
        for (const anim of this.#model.animations()) {
            const animDuration = anim.source().delay() + anim.source().duration();
            if (animDuration > duration) {
                duration = animDuration;
            }
        }
        return duration;
    }
    removeButton() {
        return this.#removeButtonInternal;
    }
    replay() {
        this.#replayOverlayElement.animate([
            { offset: 0, width: '0%', opacity: 1 },
            { offset: 0.9, width: '100%', opacity: 1 },
            { offset: 1, width: '100%', opacity: 0 },
        ], { duration: 200, easing: 'cubic-bezier(0, 0, 0.2, 1)' });
    }
    render() {
        this.#svg.removeChildren();
        const maxToShow = 10;
        const numberOfAnimations = Math.min(this.#model.animations().length, maxToShow);
        const timeToPixelRatio = 100 / Math.max(this.groupDuration(), 750);
        for (let i = 0; i < numberOfAnimations; i++) {
            const effect = this.#model.animations()[i].source();
            const line = UI.UIUtils.createSVGChild(this.#svg, 'line');
            line.setAttribute('x1', String(effect.delay() * timeToPixelRatio));
            line.setAttribute('x2', String((effect.delay() + effect.duration()) * timeToPixelRatio));
            const y = String(Math.floor(this.#viewBoxHeight / Math.max(6, numberOfAnimations) * i + 1));
            line.setAttribute('y1', y);
            line.setAttribute('y2', y);
            line.style.stroke = AnimationUI.colorForAnimation(this.#model.animations()[i]);
        }
    }
}
//# sourceMappingURL=AnimationGroupPreviewUI.js.map
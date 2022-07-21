// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as UI from '../../ui/legacy/legacy.js';
import animationScreenshotPopoverStyles from './animationScreenshotPopover.css.js';
export class AnimationScreenshotPopover extends UI.Widget.VBox {
    #frames;
    #rafId;
    #currentFrame;
    #progressBar;
    #showFrame;
    #endDelay;
    constructor(images) {
        super(true);
        console.assert(images.length > 0);
        this.contentElement.classList.add('animation-screenshot-popover');
        this.#frames = images;
        for (const image of images) {
            this.contentElement.appendChild(image);
            image.style.display = 'none';
        }
        this.#rafId = 0;
        this.#currentFrame = 0;
        this.#frames[0].style.display = 'block';
        this.#progressBar = this.contentElement.createChild('div', 'animation-progress');
    }
    wasShown() {
        this.#rafId = this.contentElement.window().requestAnimationFrame(this.changeFrame.bind(this));
        this.registerCSSFiles([animationScreenshotPopoverStyles]);
    }
    willHide() {
        this.contentElement.window().cancelAnimationFrame(this.#rafId);
        this.#endDelay = undefined;
    }
    changeFrame() {
        this.#rafId = this.contentElement.window().requestAnimationFrame(this.changeFrame.bind(this));
        if (this.#endDelay) {
            this.#endDelay--;
            return;
        }
        this.#showFrame = !this.#showFrame;
        if (!this.#showFrame) {
            return;
        }
        const numFrames = this.#frames.length;
        this.#frames[this.#currentFrame % numFrames].style.display = 'none';
        this.#currentFrame++;
        this.#frames[(this.#currentFrame) % numFrames].style.display = 'block';
        if (this.#currentFrame % numFrames === numFrames - 1) {
            this.#endDelay = 50;
        }
        this.#progressBar.style.width = (this.#currentFrame % numFrames + 1) / numFrames * 100 + '%';
    }
}
//# sourceMappingURL=AnimationScreenshotPopover.js.map
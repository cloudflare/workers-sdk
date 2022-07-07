// Copyright (c) 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../../../core/common/common.js';
import * as ComponentHelpers from '../../../components/helpers/helpers.js';
import * as LitHtml from '../../../lit-html/lit-html.js';
import cssAngleEditorStyles from './cssAngleEditor.css.js';
import { get2DTranslationsForAngle, getAngleFromRadians, getNewAngleFromEvent, getRadiansFromAngle, } from './CSSAngleUtils.js';
const { render, html } = LitHtml;
const styleMap = LitHtml.Directives.styleMap;
const CLOCK_DIAL_LENGTH = 6;
export class CSSAngleEditor extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-css-angle-editor`;
    shadow = this.attachShadow({ mode: 'open' });
    angle = {
        value: 0,
        unit: "rad" /* Rad */,
    };
    onAngleUpdate;
    background = '';
    clockRadius = 77 / 2; // By default the clock is 77 * 77.
    dialTemplates;
    mousemoveThrottler = new Common.Throttler.Throttler(16.67 /* 60fps */);
    mousemoveListener = this.onMousemove.bind(this);
    connectedCallback() {
        this.shadow.adoptedStyleSheets = [cssAngleEditorStyles];
        ComponentHelpers.SetCSSProperty.set(this, '--clock-dial-length', `${CLOCK_DIAL_LENGTH}px`);
    }
    set data(data) {
        this.angle = data.angle;
        this.onAngleUpdate = data.onAngleUpdate;
        this.background = data.background;
        this.render();
    }
    updateAngleFromMousePosition(mouseX, mouseY, shouldSnapToMultipleOf15Degrees) {
        const clock = this.shadow.querySelector('.clock');
        if (!clock || !this.onAngleUpdate) {
            return;
        }
        const { top, right, bottom, left } = clock.getBoundingClientRect();
        this.clockRadius = (right - left) / 2;
        const clockCenterX = (left + right) / 2;
        const clockCenterY = (bottom + top) / 2;
        const radian = -Math.atan2(mouseX - clockCenterX, mouseY - clockCenterY) + Math.PI;
        if (shouldSnapToMultipleOf15Degrees) {
            const multipleInRadian = getRadiansFromAngle({
                value: 15,
                unit: "deg" /* Deg */,
            });
            const closestMultipleOf15Degrees = Math.round(radian / multipleInRadian) * multipleInRadian;
            this.onAngleUpdate(getAngleFromRadians(closestMultipleOf15Degrees, this.angle.unit));
        }
        else {
            this.onAngleUpdate(getAngleFromRadians(radian, this.angle.unit));
        }
    }
    onEditorMousedown(event) {
        event.stopPropagation();
        this.updateAngleFromMousePosition(event.pageX, event.pageY, event.shiftKey);
        const targetDocument = event.target instanceof Node && event.target.ownerDocument;
        const editor = this.shadow.querySelector('.editor');
        if (targetDocument && editor) {
            targetDocument.addEventListener('mousemove', this.mousemoveListener, { capture: true });
            editor.classList.add('interacting');
            targetDocument.addEventListener('mouseup', () => {
                targetDocument.removeEventListener('mousemove', this.mousemoveListener, { capture: true });
                editor.classList.remove('interacting');
            }, { once: true });
        }
    }
    onMousemove(event) {
        const isPressed = event.buttons === 1;
        if (!isPressed) {
            return;
        }
        event.preventDefault();
        void this.mousemoveThrottler.schedule(() => {
            this.updateAngleFromMousePosition(event.pageX, event.pageY, event.shiftKey);
            return Promise.resolve();
        });
    }
    onEditorWheel(event) {
        if (!this.onAngleUpdate) {
            return;
        }
        const newAngle = getNewAngleFromEvent(this.angle, event);
        if (newAngle) {
            this.onAngleUpdate(newAngle);
        }
        event.preventDefault();
    }
    render() {
        const clockStyles = {
            background: this.background,
        };
        const { translateX, translateY } = get2DTranslationsForAngle(this.angle, this.clockRadius / 2);
        const handStyles = {
            transform: `translate(${translateX}px, ${translateY}px) rotate(${this.angle.value}${this.angle.unit})`,
        };
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        render(html `
      <div class="editor">
        <span class="pointer"></span>
        <div
          class="clock"
          style=${styleMap(clockStyles)}
          @mousedown=${this.onEditorMousedown}
          @wheel=${this.onEditorWheel}>
          ${this.renderDials()}
          <div class="hand" style=${styleMap(handStyles)}></div>
          <span class="center"></span>
        </div>
      </div>
    `, this.shadow, {
            host: this,
        });
        // clang-format on
    }
    renderDials() {
        if (!this.dialTemplates) {
            // Disabled until https://crbug.com/1079231 is fixed.
            // clang-format off
            this.dialTemplates = [0, 45, 90, 135, 180, 225, 270, 315].map(deg => {
                const radius = this.clockRadius - CLOCK_DIAL_LENGTH - 3 /* clock border */;
                const { translateX, translateY } = get2DTranslationsForAngle({
                    value: deg,
                    unit: "deg" /* Deg */,
                }, radius);
                const dialStyles = {
                    transform: `translate(${translateX}px, ${translateY}px) rotate(${deg}deg)`,
                };
                return html `<span class="dial" style=${styleMap(dialStyles)}></span>`;
            });
            // clang-format on
        }
        return this.dialTemplates;
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-css-angle-editor', CSSAngleEditor);
//# sourceMappingURL=CSSAngleEditor.js.map
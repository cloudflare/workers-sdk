// Copyright (c) 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as ComponentHelpers from '../../../components/helpers/helpers.js';
import * as LitHtml from '../../../lit-html/lit-html.js';
import cssAngleStyles from './cssAngle.css.js';
import { convertAngleUnit, getNewAngleFromEvent, getNextUnit, parseText, roundAngleByUnit, } from './CSSAngleUtils.js';
import { ValueChangedEvent } from './InlineEditorUtils.js';
import { CSSAngleEditor } from './CSSAngleEditor.js';
import { CSSAngleSwatch } from './CSSAngleSwatch.js';
const { render, html } = LitHtml;
const styleMap = LitHtml.Directives.styleMap;
const ContextAwareProperties = new Set(['color', 'background', 'background-color']);
export class PopoverToggledEvent extends Event {
    static eventName = 'popovertoggled';
    data;
    constructor(open) {
        super(PopoverToggledEvent.eventName, {});
        this.data = { open };
    }
}
export class UnitChangedEvent extends Event {
    static eventName = 'unitchanged';
    data;
    constructor(value) {
        super(UnitChangedEvent.eventName, {});
        this.data = { value };
    }
}
const DefaultAngle = {
    value: 0,
    unit: "rad" /* Rad */,
};
export class CSSAngle extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-css-angle`;
    shadow = this.attachShadow({ mode: 'open' });
    angle = DefaultAngle;
    displayedAngle = DefaultAngle;
    propertyName = '';
    propertyValue = '';
    containingPane;
    angleElement = null;
    swatchElement = null;
    popoverOpen = false;
    popoverStyleTop = '';
    popoverStyleLeft = '';
    onMinifyingAction = this.minify.bind(this);
    connectedCallback() {
        this.shadow.adoptedStyleSheets = [cssAngleStyles];
    }
    set data(data) {
        const parsedResult = parseText(data.angleText);
        if (!parsedResult) {
            return;
        }
        this.angle = parsedResult;
        this.displayedAngle = { ...parsedResult };
        this.propertyName = data.propertyName;
        this.propertyValue = data.propertyValue;
        this.containingPane = data.containingPane;
        this.render();
    }
    disconnectedCallback() {
        this.unbindMinifyingAction();
    }
    // We bind and unbind mouse event listeners upon popping over and minifying,
    // because we anticipate most of the time this widget is minified even when
    // it's attached to the DOM tree.
    popover() {
        if (!this.containingPane) {
            return;
        }
        if (!this.angleElement) {
            this.angleElement = this.shadow.querySelector('.css-angle');
        }
        if (!this.swatchElement) {
            this.swatchElement = this.shadow.querySelector('devtools-css-angle-swatch');
        }
        if (!this.angleElement || !this.swatchElement) {
            return;
        }
        this.dispatchEvent(new PopoverToggledEvent(true));
        this.bindMinifyingAction();
        const miniIconBottom = this.swatchElement.getBoundingClientRect().bottom;
        const miniIconLeft = this.swatchElement.getBoundingClientRect().left;
        if (miniIconBottom && miniIconLeft) {
            this.popoverStyleTop = `${miniIconBottom}px`;
            this.popoverStyleLeft = `${miniIconLeft}px`;
        }
        this.popoverOpen = true;
        this.render();
        this.angleElement.focus();
    }
    minify() {
        if (this.popoverOpen === false) {
            return;
        }
        this.popoverOpen = false;
        this.dispatchEvent(new PopoverToggledEvent(false));
        this.unbindMinifyingAction();
        this.render();
    }
    updateProperty(name, value) {
        this.propertyName = name;
        this.propertyValue = value;
        this.render();
    }
    updateAngle(angle) {
        this.displayedAngle = roundAngleByUnit(convertAngleUnit(angle, this.displayedAngle.unit));
        this.angle = this.displayedAngle;
        this.dispatchEvent(new ValueChangedEvent(`${this.angle.value}${this.angle.unit}`));
    }
    displayNextUnit() {
        const nextUnit = getNextUnit(this.displayedAngle.unit);
        this.displayedAngle = roundAngleByUnit(convertAngleUnit(this.angle, nextUnit));
        this.dispatchEvent(new UnitChangedEvent(`${this.displayedAngle.value}${this.displayedAngle.unit}`));
    }
    bindMinifyingAction() {
        document.addEventListener('mousedown', this.onMinifyingAction);
        if (this.containingPane) {
            this.containingPane.addEventListener('scroll', this.onMinifyingAction);
        }
    }
    unbindMinifyingAction() {
        document.removeEventListener('mousedown', this.onMinifyingAction);
        if (this.containingPane) {
            this.containingPane.removeEventListener('scroll', this.onMinifyingAction);
        }
    }
    onMiniIconClick(event) {
        event.stopPropagation();
        if (event.shiftKey && !this.popoverOpen) {
            this.displayNextUnit();
            return;
        }
        this.popoverOpen ? this.minify() : this.popover();
    }
    // Fix that the previous text will be selected when double-clicking the angle icon
    consume(event) {
        event.stopPropagation();
    }
    onKeydown(event) {
        if (!this.popoverOpen) {
            return;
        }
        switch (event.key) {
            case 'Escape':
                event.stopPropagation();
                this.minify();
                this.blur();
                break;
            case 'ArrowUp':
            case 'ArrowDown': {
                const newAngle = getNewAngleFromEvent(this.angle, event);
                if (newAngle) {
                    this.updateAngle(newAngle);
                }
                event.preventDefault();
                break;
            }
        }
    }
    render() {
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        render(html `
      <div class="css-angle" @keydown=${this.onKeydown} tabindex="-1">
        <div class="preview">
          <${CSSAngleSwatch.litTagName}
            @click=${this.onMiniIconClick}
            @mousedown=${this.consume}
            @dblclick=${this.consume}
            .data=${{
            angle: this.angle,
        }}>
          </${CSSAngleSwatch.litTagName}><slot></slot></div>
        ${this.popoverOpen ? this.renderPopover() : null}
      </div>
    `, this.shadow, {
            host: this,
        });
        // clang-format on
    }
    renderPopover() {
        let contextualBackground = '';
        // TODO(crbug.com/1143010): for now we ignore values with "url"; when we refactor
        // CSS value parsing we should properly apply atomic contextual background.
        if (ContextAwareProperties.has(this.propertyName) && !this.propertyValue.match(/url\(.*\)/i)) {
            contextualBackground = this.propertyValue;
        }
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        return html `
    <${CSSAngleEditor.litTagName}
      class="popover popover-css-angle"
      style=${styleMap({ top: this.popoverStyleTop, left: this.popoverStyleLeft })}
      .data=${{
            angle: this.angle,
            onAngleUpdate: (angle) => {
                this.updateAngle(angle);
            },
            background: contextualBackground,
        }}
    ></${CSSAngleEditor.litTagName}>
    `;
        // clang-format on
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-css-angle', CSSAngle);
//# sourceMappingURL=CSSAngle.js.map
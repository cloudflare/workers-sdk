// Copyright (c) 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as ComponentHelpers from '../../../ui/components/helpers/helpers.js';
import * as LitHtml from '../../../ui/lit-html/lit-html.js';
import computedStylePropertyStyles from './computedStyleProperty.css.js';
const { render, html } = LitHtml;
export class ComputedStyleProperty extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-computed-style-property`;
    #shadow = this.attachShadow({ mode: 'open' });
    #propertyNameRenderer = undefined;
    #propertyValueRenderer = undefined;
    #inherited = false;
    #traceable = false;
    #onNavigateToSource = () => { };
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [computedStylePropertyStyles];
    }
    set data(data) {
        this.#propertyNameRenderer = data.propertyNameRenderer;
        this.#propertyValueRenderer = data.propertyValueRenderer;
        this.#inherited = data.inherited;
        this.#traceable = data.traceable;
        this.#onNavigateToSource = data.onNavigateToSource;
        this.#render();
    }
    #render() {
        const propertyNameElement = this.#propertyNameRenderer?.();
        const propertyValueElement = this.#propertyValueRenderer?.();
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        render(html `
      <div class="computed-style-property ${this.#inherited ? 'inherited' : ''}">
        <div class="property-name">
          ${propertyNameElement}
        </div>
        <span class="hidden" aria-hidden="false">: </span>
        ${this.#traceable ?
            html `<span class="goto" @click=${this.#onNavigateToSource}></span>` :
            null}
        <div class="property-value">
          ${propertyValueElement}
        </div>
        <span class="hidden" aria-hidden="false">;</span>
      </div>
    `, this.#shadow, {
            host: this,
        });
        // clang-format on
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-computed-style-property', ComputedStyleProperty);
//# sourceMappingURL=ComputedStyleProperty.js.map
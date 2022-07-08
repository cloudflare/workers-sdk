// Copyright (c) 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as LitHtml from '../../../ui/lit-html/lit-html.js';
import * as ComponentHelpers from '../helpers/helpers.js';
import nodeTextStyles from './nodeText.css.js';
const { render, html } = LitHtml;
export class NodeText extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-node-text`;
    #shadow = this.attachShadow({ mode: 'open' });
    #nodeTitle = '';
    #nodeId = '';
    #nodeClasses = [];
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [nodeTextStyles];
    }
    set data(data) {
        this.#nodeTitle = data.nodeTitle;
        this.#nodeId = data.nodeId;
        this.#nodeClasses = data.nodeClasses;
        this.#render();
    }
    #render() {
        const hasId = Boolean(this.#nodeId);
        const hasNodeClasses = Boolean(this.#nodeClasses && this.#nodeClasses.length > 0);
        const parts = [
            html `<span class="node-label-name">${this.#nodeTitle}</span>`,
        ];
        if (this.#nodeId) {
            const classes = LitHtml.Directives.classMap({
                'node-label-id': true,
                'node-multiple-descriptors': hasNodeClasses,
            });
            parts.push(html `<span class=${classes}>#${CSS.escape(this.#nodeId)}</span>`);
        }
        if (this.#nodeClasses && this.#nodeClasses.length > 0) {
            const text = this.#nodeClasses.map(c => `.${CSS.escape(c)}`).join('');
            const classes = LitHtml.Directives.classMap({
                'node-label-class': true,
                'node-multiple-descriptors': hasId,
            });
            parts.push(html `<span class=${classes}>${text}</span>`);
        }
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        render(html `
      ${parts}
    `, this.#shadow, {
            host: this,
        });
        // clang-format on
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-node-text', NodeText);
//# sourceMappingURL=NodeText.js.map
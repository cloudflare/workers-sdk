// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as ComponentHelpers from '../../components/helpers/helpers.js';
import * as LitHtml from '../../lit-html/lit-html.js';
import expandableListStyles from './expandableList.css.js';
export class ExpandableList extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-expandable-list`;
    #shadow = this.attachShadow({ mode: 'open' });
    #expanded = false;
    #rows = [];
    set data(data) {
        this.#rows = data.rows;
        this.#render();
    }
    #onArrowClick() {
        this.#expanded = !this.#expanded;
        this.#render();
    }
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [expandableListStyles];
    }
    #render() {
        if (this.#rows.length < 1) {
            return;
        }
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        LitHtml.render(LitHtml.html `
      <div class="expandable-list-container">
        <div>
          ${this.#rows.length > 1 ?
            LitHtml.html `
              <button @click=${() => this.#onArrowClick()} class="arrow-icon-button">
                <span class="arrow-icon ${this.#expanded ? 'expanded' : ''}"></span>
              </button>
            `
            : LitHtml.nothing}
        </div>
        <div class="expandable-list-items">
          ${this.#rows.filter((_, index) => (this.#expanded || index === 0)).map(row => LitHtml.html `
            ${row}
          `)}
        </div>
      </div>
    `, this.#shadow, { host: this });
        // clang-format on
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-expandable-list', ExpandableList);
//# sourceMappingURL=ExpandableList.js.map
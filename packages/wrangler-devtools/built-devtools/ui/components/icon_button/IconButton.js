// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as ComponentHelpers from '../../components/helpers/helpers.js';
import * as LitHtml from '../../lit-html/lit-html.js';
import { Icon } from './Icon.js';
import iconButtonStyles from './iconButton.css.js';
export class IconButton extends HTMLElement {
    static litTagName = LitHtml.literal `icon-button`;
    #shadow = this.attachShadow({ mode: 'open' });
    #clickHandler = undefined;
    #groups = [];
    #compact = false;
    #leadingText = '';
    #trailingText = '';
    #accessibleName;
    set data(data) {
        this.#groups = data.groups.map(group => ({ ...group })); // Ensure we make a deep copy.
        this.#clickHandler = data.clickHandler;
        this.#trailingText = data.trailingText ?? '';
        this.#leadingText = data.leadingText ?? '';
        this.#accessibleName = data.accessibleName;
        this.#compact = Boolean(data.compact);
        this.#render();
    }
    get data() {
        return {
            groups: this.#groups.map(group => ({ ...group })),
            accessibleName: this.#accessibleName,
            clickHandler: this.#clickHandler,
            leadingText: this.#leadingText,
            trailingText: this.#trailingText,
            compact: this.#compact,
        };
    }
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [iconButtonStyles];
    }
    #onClickHandler(event) {
        if (this.#clickHandler) {
            event.preventDefault();
            this.#clickHandler();
        }
    }
    #render() {
        const buttonClasses = LitHtml.Directives.classMap({
            'icon-button': true,
            'with-click-handler': Boolean(this.#clickHandler),
            'compact': this.#compact,
        });
        const filteredGroups = this.#groups.filter(counter => counter.text !== undefined)
            .filter((_, index) => this.#compact ? index === 0 : true);
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        LitHtml.render(LitHtml.html `
      <button class=${buttonClasses} @click=${this.#onClickHandler} aria-label=${LitHtml.Directives.ifDefined(this.#accessibleName)}>
      ${(!this.#compact && this.#leadingText) ? LitHtml.html `<span class="icon-button-title">${this.#leadingText}</span>` : LitHtml.nothing}
      ${filteredGroups.map(counter => LitHtml.html `
      <${Icon.litTagName} class="status-icon"
      .data=${{ iconName: counter.iconName, color: counter.iconColor, width: counter.iconWidth || '1.5ex', height: counter.iconHeight || '1.5ex' }}>
      </${Icon.litTagName}>
      ${this.#compact ? LitHtml.html `<!-- Force line-height for this element --><span>&#8203;</span>` : LitHtml.nothing}
      <span class="icon-button-title">${counter.text}</span>
      </button>`)}
      ${(!this.#compact && this.#trailingText) ? LitHtml.html `<span class="icon-button-title">${this.#trailingText}</span>` : LitHtml.nothing}
    `, this.#shadow, { host: this });
        // clang-format on
    }
}
ComponentHelpers.CustomElements.defineComponent('icon-button', IconButton);
//# sourceMappingURL=IconButton.js.map
// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as ComponentHelpers from '../../../ui/components/helpers/helpers.js';
import * as LitHtml from '../../../ui/lit-html/lit-html.js';
import * as i18n from '../../../core/i18n/i18n.js';
import cssHintDetailsViewStyles from './cssHintDetailsView.css.js';
const UIStrings = {
    /**
      *@description Text for button that redirects to CSS property documentation.
      */
    learnMore: 'Learn More',
};
const str_ = i18n.i18n.registerUIStrings('panels/elements/components/CSSHintDetailsView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const { render, html, Directives } = LitHtml;
export class CSSHintDetailsView extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-css-hint-details-view`;
    #shadow = this.attachShadow({ mode: 'open' });
    #authoringHint;
    constructor(authoringHint) {
        super();
        this.#authoringHint = authoringHint;
        this.#shadow.adoptedStyleSheets = [cssHintDetailsViewStyles];
        this.#render();
    }
    #render() {
        render(html `
            <div class="hint-popup-wrapper">
                <div class="hint-popup-reason">
                    <strong>${this.#authoringHint.getHintPrefix()}:</strong> ${Directives.unsafeHTML(this.#authoringHint.getHintMessage())}
                </div>
                ${this.#authoringHint.getPossibleFixMessage() ? html `
                    <div class="hint-popup-possible-fix">
                        ${Directives.unsafeHTML(this.#authoringHint.getPossibleFixMessage())}
                        ${this.#authoringHint.getLearnMoreLink() ? html `
                            <x-link id='learn-more' href='${this.#authoringHint.getLearnMoreLink()}' class='clickable underlined unbreakable-text'}>
                                ${i18nString(UIStrings.learnMore)}
                            </x-link>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `, this.#shadow, {
            host: this,
        });
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-css-hint-details-view', CSSHintDetailsView);
//# sourceMappingURL=CSSHintDetailsView.js.map
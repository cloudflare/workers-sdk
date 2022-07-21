// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as DataGrid from '../../../ui/components/data_grid/data_grid.js';
import * as ComponentHelpers from '../../../ui/components/helpers/helpers.js';
import * as IconButton from '../../../ui/components/icon_button/icon_button.js';
import * as LitHtml from '../../../ui/lit-html/lit-html.js';
import trustTokensViewStyles from './trustTokensView.css.js';
import trustTokensViewDeleteButtonStyles from './trustTokensViewDeleteButton.css.js';
const UIStrings = {
    /**
    *@description Text for the issuer of an item
    */
    issuer: 'Issuer',
    /**
    *@description Column header for Trust Token table
    */
    storedTokenCount: 'Stored token count',
    /**
    *@description Hover text for an info icon in the Trust Token panel
    */
    allStoredTrustTokensAvailableIn: 'All stored Trust Tokens available in this browser instance.',
    /**
     * @description Text shown instead of a table when the table would be empty.
     */
    noTrustTokensStored: 'No Trust Tokens are currently stored.',
    /**
     * @description Each row in the Trust Token table has a delete button. This is the text shown
     * when hovering over this button. The placeholder is a normal URL, indicating the site which
     * provided the Trust Tokens that will be deleted when the button is clicked.
     * @example {https://google.com} PH1
     */
    deleteTrustTokens: 'Delete all stored Trust Tokens issued by {PH1}.',
};
const str_ = i18n.i18n.registerUIStrings('panels/application/components/TrustTokensView.ts', UIStrings);
export const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
class TrustTokensDeleteButton extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-trust-tokens-delete-button`;
    #shadow = this.attachShadow({ mode: 'open' });
    #issuer = null;
    #deleteClickHandler = () => { };
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [trustTokensViewDeleteButtonStyles];
    }
    set data(data) {
        this.#issuer = data.issuer;
        this.#deleteClickHandler = data.deleteClickHandler;
        this.#render();
    }
    #render() {
        if (!this.#issuer) {
            return;
        }
        // clang-format off
        LitHtml.render(LitHtml.html `
      <!-- Wrap the button in a container, otherwise we can't center it inside the column. -->
      <span class="button-container">
        <button class="delete-button"
          title=${i18nString(UIStrings.deleteTrustTokens, { PH1: this.#issuer })}
          @click=${() => this.#deleteClickHandler(this.#issuer)}>
          <${IconButton.Icon.Icon.litTagName} .data=${{ iconName: 'trash_bin_icon', color: 'var(--color-text-secondary)', width: '9px', height: '14px' }}>
          </${IconButton.Icon.Icon.litTagName}>
        </button>
      </span>`, this.#shadow, { host: this });
        // clang-format on
    }
}
export class TrustTokensView extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-trust-tokens-storage-view`;
    #shadow = this.attachShadow({ mode: 'open' });
    #tokens = [];
    #deleteClickHandler = () => { };
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [trustTokensViewStyles];
        this.#render();
    }
    set data(data) {
        this.#tokens = data.tokens;
        this.#deleteClickHandler = data.deleteClickHandler;
        this.#render();
    }
    #render() {
        // clang-format off
        LitHtml.render(LitHtml.html `
      <div>
        <span class="heading">Trust Tokens</span>
        <${IconButton.Icon.Icon.litTagName} class="info-icon" title=${i18nString(UIStrings.allStoredTrustTokensAvailableIn)}
          .data=${{ iconName: 'ic_info_black_18dp', color: 'var(--color-link)', width: '14px' }}>
        </${IconButton.Icon.Icon.litTagName}>
        ${this.#renderGridOrNoDataMessage()}
      </div>
    `, this.#shadow, { host: this });
        // clang-format on
    }
    #renderGridOrNoDataMessage() {
        if (this.#tokens.length === 0) {
            return LitHtml.html `<div class="no-tt-message">${i18nString(UIStrings.noTrustTokensStored)}</div>`;
        }
        const gridData = {
            columns: [
                {
                    id: 'issuer',
                    title: i18nString(UIStrings.issuer),
                    widthWeighting: 10,
                    hideable: false,
                    visible: true,
                    sortable: true,
                },
                {
                    id: 'count',
                    title: i18nString(UIStrings.storedTokenCount),
                    widthWeighting: 5,
                    hideable: false,
                    visible: true,
                    sortable: true,
                },
                {
                    id: 'delete-button',
                    title: '',
                    widthWeighting: 1,
                    hideable: false,
                    visible: true,
                    sortable: false,
                },
            ],
            rows: this.#buildRowsFromTokens(),
            initialSort: {
                columnId: 'issuer',
                direction: "ASC" /* ASC */,
            },
        };
        return LitHtml.html `
      <${DataGrid.DataGridController.DataGridController.litTagName} .data=${gridData}></${DataGrid.DataGridController.DataGridController.litTagName}>
    `;
    }
    #buildRowsFromTokens() {
        const tokens = this.#tokens.filter(token => token.count > 0);
        return tokens.map(token => ({
            cells: [
                {
                    columnId: 'delete-button',
                    value: removeTrailingSlash(token.issuerOrigin),
                    renderer: this.#deleteButtonRendererForDataGridCell.bind(this),
                },
                { columnId: 'issuer', value: removeTrailingSlash(token.issuerOrigin) },
                { columnId: 'count', value: token.count },
            ],
        }));
    }
    #deleteButtonRendererForDataGridCell(issuer) {
        // clang-format off
        return LitHtml.html `<${TrustTokensDeleteButton.litTagName}
     .data=${{ issuer, deleteClickHandler: this.#deleteClickHandler }}
    ></${TrustTokensDeleteButton.litTagName}>`;
        // clang-format on
    }
}
function removeTrailingSlash(s) {
    return s.replace(/\/$/, '');
}
ComponentHelpers.CustomElements.defineComponent('devtools-trust-tokens-delete-button', TrustTokensDeleteButton);
ComponentHelpers.CustomElements.defineComponent('devtools-trust-tokens-storage-view', TrustTokensView);
//# sourceMappingURL=TrustTokensView.js.map
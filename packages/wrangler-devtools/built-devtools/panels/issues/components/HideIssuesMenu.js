// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../../core/common/common.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as ComponentHelpers from '../../../ui/components/helpers/helpers.js';
import * as IconButton from '../../../ui/components/icon_button/icon_button.js';
import * as UI from '../../../ui/legacy/legacy.js';
import * as LitHtml from '../../../ui/lit-html/lit-html.js';
import hideIssuesMenuStyles from './hideIssuesMenu.css.js';
const UIStrings = {
    /**
    *@description Title for the tooltip of the (3 dots) Hide Issues menu icon.
    */
    tooltipTitle: 'Hide issues',
};
const str_ = i18n.i18n.registerUIStrings('panels/issues/components/HideIssuesMenu.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class HideIssuesMenu extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-hide-issues-menu`;
    #shadow = this.attachShadow({ mode: 'open' });
    #menuItemLabel = Common.UIString.LocalizedEmptyString;
    #menuItemAction = () => { };
    set data(data) {
        this.#menuItemLabel = data.menuItemLabel;
        this.#menuItemAction = data.menuItemAction;
        this.#render();
    }
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [hideIssuesMenuStyles];
    }
    onMenuOpen(event) {
        event.stopPropagation();
        const contextMenu = new UI.ContextMenu.ContextMenu(event, {
            useSoftMenu: true,
            onSoftMenuClosed: () => {
                this.classList.toggle('has-context-menu-opened', false);
            },
        });
        contextMenu.headerSection().appendItem(this.#menuItemLabel, () => this.#menuItemAction());
        void contextMenu.show();
        this.classList.toggle('has-context-menu-opened', true);
    }
    #render() {
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        LitHtml.render(LitHtml.html `
        <button class="hide-issues-menu-btn" @click=${this.onMenuOpen.bind(this)} title=${i18nString(UIStrings.tooltipTitle)}>
        <${IconButton.Icon.Icon.litTagName}
          .data=${{ color: '', iconName: 'three_dots_menu_icon', height: '14px', width: '4px' }}
        >
        </${IconButton.Icon.Icon.litTagName}>
        </button>
      `, this.#shadow, { host: this });
    }
}
ComponentHelpers.CustomElements.defineComponent('devtools-hide-issues-menu', HideIssuesMenu);
//# sourceMappingURL=HideIssuesMenu.js.map
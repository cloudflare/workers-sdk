// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../../core/common/common.js';
import * as ComponentHelpers from '../../../ui/components/helpers/helpers.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as LitHtml from '../../../ui/lit-html/lit-html.js';
import * as Settings from '../../../ui/components/settings/settings.js';
import * as ChromeLink from '../../../ui/components/chrome_link/chrome_link.js';
import syncSectionStyles from './syncSection.css.js';
const UIStrings = {
    /**
     * @description Text shown to the user in the Settings UI. 'This setting' refers
     * to a checkbox that is disabled.
     */
    syncDisabled: 'To turn this setting on, you must enable Chrome sync.',
    /**
     * @description Text shown to the user in the Settings UI. 'This setting' refers
     * to a checkbox that is disabled.
     */
    preferencesSyncDisabled: 'To turn this setting on, you must first enable settings sync in Chrome.',
    /**
     * @description Label for a link that take the user to the "Sync" section of the
     * chrome settings. The link is shown in the DevTools Settings UI.
     */
    settings: 'Go to Settings',
    /**
     * @description Label for the account email address. Shown in the DevTools Settings UI in
     * front of the email address currently used for Chrome Sync.
     */
    signedIn: 'Signed into Chrome as:',
};
const str_ = i18n.i18n.registerUIStrings('panels/settings/components/SyncSection.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class SyncSection extends HTMLElement {
    static litTagName = LitHtml.literal `devtools-sync-section`;
    #shadow = this.attachShadow({ mode: 'open' });
    #syncInfo = { isSyncActive: false };
    #syncSetting;
    #boundRender = this.#render.bind(this);
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [syncSectionStyles];
    }
    set data(data) {
        this.#syncInfo = data.syncInfo;
        this.#syncSetting = data.syncSetting;
        void ComponentHelpers.ScheduledRender.scheduleRender(this, this.#boundRender);
    }
    #render() {
        if (!this.#syncSetting) {
            throw new Error('SyncSection not properly initialized');
        }
        const checkboxDisabled = !this.#syncInfo.isSyncActive || !this.#syncInfo.arePreferencesSynced;
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        LitHtml.render(LitHtml.html `
      <fieldset>
        <legend>${Common.Settings.getLocalizedSettingsCategory(Common.Settings.SettingCategory.SYNC)}</legend>
        ${renderAccountInfoOrWarning(this.#syncInfo)}
        <${Settings.SettingCheckbox.SettingCheckbox.litTagName} .data=${{ setting: this.#syncSetting, disabled: checkboxDisabled }}>
        </${Settings.SettingCheckbox.SettingCheckbox.litTagName}>
      </fieldset>
    `, this.#shadow, { host: this });
        // clang-format on
    }
}
/* x-link doesn't work with custom click/keydown handlers */
/* eslint-disable rulesdir/ban_a_tags_in_lit_html */
function renderAccountInfoOrWarning(syncInfo) {
    if (!syncInfo.isSyncActive) {
        const link = 'chrome://settings/syncSetup';
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        return LitHtml.html `
      <span class="warning">
        ${i18nString(UIStrings.syncDisabled)}
        <${ChromeLink.ChromeLink.ChromeLink.litTagName} .href=${link}>${i18nString(UIStrings.settings)}</${ChromeLink.ChromeLink.ChromeLink.litTagName}>
      </span>`;
        // clang-format on
    }
    if (!syncInfo.arePreferencesSynced) {
        const link = 'chrome://settings/syncSetup/advanced';
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        return LitHtml.html `
      <span class="warning">
        ${i18nString(UIStrings.preferencesSyncDisabled)}
        <${ChromeLink.ChromeLink.ChromeLink.litTagName} .href=${link}>${i18nString(UIStrings.settings)}</${ChromeLink.ChromeLink.ChromeLink.litTagName}>
      </span>`;
        // clang-format on
    }
    return LitHtml.html `
    <div class="account-info">
      <img src="data:image/png;base64, ${syncInfo.accountImage}" alt="Account avatar" />
      <div class="account-email">
        <span>${i18nString(UIStrings.signedIn)}</span>
        <span>${syncInfo.accountEmail}</span>
      </div>
    </div>`;
}
ComponentHelpers.CustomElements.defineComponent('devtools-sync-section', SyncSection);
//# sourceMappingURL=SyncSection.js.map
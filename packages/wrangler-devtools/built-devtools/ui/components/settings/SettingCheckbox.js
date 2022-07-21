// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as ComponentHelpers from '../../components/helpers/helpers.js';
import * as LitHtml from '../../lit-html/lit-html.js';
import * as Input from '../input/input.js';
import settingCheckboxStyles from './settingCheckbox.css.js';
/**
 * A simple checkbox that is backed by a boolean setting.
 */
export class SettingCheckbox extends HTMLElement {
    static litTagName = LitHtml.literal `setting-checkbox`;
    #shadow = this.attachShadow({ mode: 'open' });
    #setting;
    #disabled = false;
    #changeListenerDescriptor;
    connectedCallback() {
        this.#shadow.adoptedStyleSheets = [Input.checkboxStyles, settingCheckboxStyles];
    }
    set data(data) {
        if (this.#changeListenerDescriptor && this.#setting) {
            this.#setting.removeChangeListener(this.#changeListenerDescriptor.listener);
        }
        this.#setting = data.setting;
        this.#disabled = Boolean(data.disabled);
        this.#changeListenerDescriptor = this.#setting.addChangeListener(() => {
            this.#render();
        });
        this.#render();
    }
    #render() {
        if (!this.#setting) {
            throw new Error('No "Setting" object provided for rendering');
        }
        LitHtml.render(LitHtml.html `
      <p>
        <label>
          <input type="checkbox" ?checked=${this.#setting.get()} ?disabled=${this.#disabled || this.#setting.disabled()} @change=${this.#checkboxChanged} aria-label=${this.#setting.title()} /> ${this.#setting.title()}
        </label>
      </p>`, this.#shadow, { host: this });
    }
    #checkboxChanged(e) {
        this.#setting?.set(e.target.checked);
    }
}
ComponentHelpers.CustomElements.defineComponent('setting-checkbox', SettingCheckbox);
//# sourceMappingURL=SettingCheckbox.js.map
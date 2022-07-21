// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as UI from '../../ui/legacy/legacy.js';
export class RadioSetting {
    setting;
    options;
    element;
    radioElements;
    ignoreChangeEvents;
    selectedIndex;
    constructor(options, setting, description) {
        this.setting = setting;
        this.options = options;
        this.element = document.createElement('div');
        UI.ARIAUtils.setDescription(this.element, description);
        UI.ARIAUtils.markAsRadioGroup(this.element);
        this.radioElements = [];
        for (const option of this.options) {
            const fragment = UI.Fragment.Fragment.build `
  <label $="label" class="lighthouse-radio">
  <input $="input" type="radio" value=${option.value} name=${setting.name}>
  <span $="span" class="lighthouse-radio-text">${option.label()}</span>
  </label>
  `;
            this.element.appendChild(fragment.element());
            const tooltip = option.tooltip?.() || description;
            if (description) {
                UI.Tooltip.Tooltip.install(fragment.$('input'), tooltip);
                UI.Tooltip.Tooltip.install(fragment.$('span'), tooltip);
            }
            const radioElement = fragment.$('input');
            radioElement.addEventListener('change', this.valueChanged.bind(this));
            this.radioElements.push(radioElement);
        }
        this.ignoreChangeEvents = false;
        this.selectedIndex = -1;
        setting.addChangeListener(this.settingChanged, this);
        this.settingChanged();
    }
    updateUI() {
        this.ignoreChangeEvents = true;
        this.radioElements[this.selectedIndex].checked = true;
        this.ignoreChangeEvents = false;
    }
    settingChanged() {
        const value = this.setting.get();
        this.selectedIndex = this.options.findIndex(option => option.value === value);
        this.updateUI();
    }
    valueChanged(_event) {
        if (this.ignoreChangeEvents) {
            return;
        }
        const selectedRadio = this.radioElements.find(radio => radio.checked);
        if (!selectedRadio) {
            return;
        }
        this.setting.set(selectedRadio.value);
    }
}
//# sourceMappingURL=RadioSetting.js.map
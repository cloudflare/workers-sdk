// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import * as UI from '../../ui/legacy/legacy.js';
import { StartView } from './LighthouseStartView.js';
import { Events } from './LighthouseController.js';
const UIStrings = {
    /**
     * @description Text displayed as the title of a panel that can be used to audit a web page with Lighthouse.
     */
    generateLighthouseReport: 'Generate a Lighthouse report',
    /**
     * @description Text that refers to the Lighthouse mode
     */
    mode: 'Mode',
    /**
     * @description Title in the Lighthouse Start View for list of categories to run during audit
     */
    categories: 'Categories',
    /**
     * @description Title in the Lighthouse Start View for list of available start plugins
     */
    plugins: 'Plugins',
    /**
     * @description Label for a button to start analyzing a page navigation with Lighthouse
     */
    analyzeNavigation: 'Analyze page load',
    /**
     * @description Label for a button to start analyzing the current page state with Lighthouse
     */
    analyzeSnapshot: 'Analyze page state',
    /**
     * @description Label for a button that starts a Lighthouse mode that analyzes user interactions over a period of time.
     */
    startTimespan: 'Start timespan',
};
const str_ = i18n.i18n.registerUIStrings('panels/lighthouse/LighthouseStartViewFR.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class StartViewFR extends StartView {
    changeFormMode;
    render() {
        this.populateRuntimeSettingAsToolbarCheckbox('lighthouse.legacy_navigation', this.settingsToolbarInternal);
        this.populateRuntimeSettingAsToolbarCheckbox('lighthouse.clear_storage', this.settingsToolbarInternal);
        this.populateRuntimeSettingAsToolbarDropdown('lighthouse.throttling', this.settingsToolbarInternal);
        const { mode } = this.controller.getFlags();
        this.populateStartButton(mode);
        const fragment = UI.Fragment.Fragment.build `
<form class="lighthouse-start-view-fr">
  <header class="hbox">
    <div class="lighthouse-logo"></div>
    <div class="lighthouse-title">${i18nString(UIStrings.generateLighthouseReport)}</div>
    <div class="lighthouse-start-button-container" $="start-button-container">${this.startButton}</div>
  </header>
  <div $="help-text" class="lighthouse-help-text hidden"></div>
  <div class="lighthouse-options hbox">
    <div class="lighthouse-form-section">
      <div class="lighthouse-form-elements" $="mode-form-elements"></div>
    </div>
    <div class="lighthouse-form-section">
      <div class="lighthouse-form-elements" $="device-type-form-elements"></div>
    </div>
    <div class="lighthouse-form-categories">
      <div class="lighthouse-form-section">
        <div class="lighthouse-form-section-label">${i18nString(UIStrings.categories)}</div>
        <div class="lighthouse-form-elements" $="categories-form-elements"></div>
      </div>
      <div class="lighthouse-form-section">
        <div class="lighthouse-form-section-label">
          <div class="lighthouse-icon-label">${i18nString(UIStrings.plugins)}</div>
        </div>
        <div class="lighthouse-form-elements" $="plugins-form-elements"></div>
      </div>
    </div>
  </div>
  <div $="warning-text" class="lighthouse-warning-text hidden"></div>
</form>
    `;
        this.helpText = fragment.$('help-text');
        this.warningText = fragment.$('warning-text');
        const modeFormElements = fragment.$('mode-form-elements');
        this.populateRuntimeSettingAsRadio('lighthouse.mode', i18nString(UIStrings.mode), modeFormElements);
        // The previous radios are removed later and don't exist on the new fragment yet.
        this.populateFormControls(fragment, mode);
        this.contentElement.textContent = '';
        this.contentElement.append(fragment.element());
        this.refresh();
    }
    populateStartButton(mode) {
        let buttonLabel;
        let callback;
        if (mode === 'timespan') {
            buttonLabel = i18nString(UIStrings.startTimespan);
            callback = () => {
                this.controller.dispatchEventToListeners(Events.RequestLighthouseTimespanStart, 
                /* keyboardInitiated */ this.startButton.matches(':focus-visible'));
            };
        }
        else if (mode === 'snapshot') {
            buttonLabel = i18nString(UIStrings.analyzeSnapshot);
            callback = () => {
                this.controller.dispatchEventToListeners(Events.RequestLighthouseStart, 
                /* keyboardInitiated */ this.startButton.matches(':focus-visible'));
            };
        }
        else {
            buttonLabel = i18nString(UIStrings.analyzeNavigation);
            callback = () => {
                this.controller.dispatchEventToListeners(Events.RequestLighthouseStart, 
                /* keyboardInitiated */ this.startButton.matches(':focus-visible'));
            };
        }
        const startButtonContainer = this.contentElement.querySelector('.lighthouse-start-button-container');
        if (startButtonContainer) {
            startButtonContainer.textContent = '';
            this.startButton = UI.UIUtils.createTextButton(buttonLabel, callback, 
            /* className */ '', 
            /* primary */ true);
            startButtonContainer.append(this.startButton);
        }
    }
    refresh() {
        const { mode } = this.controller.getFlags();
        this.populateStartButton(mode);
        for (const { checkbox, preset } of this.checkboxes) {
            if (preset.supportedModes.includes(mode)) {
                checkbox.setEnabled(true);
                checkbox.setIndeterminate(false);
            }
            else {
                checkbox.setEnabled(false);
                checkbox.setIndeterminate(true);
            }
        }
        // Ensure the correct layout is used after refresh.
        this.onResize();
    }
    onResize() {
        const useNarrowLayout = this.contentElement.offsetWidth < 500;
        const useWideLayout = this.contentElement.offsetWidth > 800;
        const headerEl = this.contentElement.querySelector('.lighthouse-start-view-fr header');
        const optionsEl = this.contentElement.querySelector('.lighthouse-options');
        if (headerEl) {
            headerEl.classList.toggle('hbox', !useNarrowLayout);
            headerEl.classList.toggle('vbox', useNarrowLayout);
        }
        if (optionsEl) {
            optionsEl.classList.toggle('wide', useWideLayout);
            optionsEl.classList.toggle('narrow', useNarrowLayout);
        }
    }
}
//# sourceMappingURL=LighthouseStartViewFR.js.map
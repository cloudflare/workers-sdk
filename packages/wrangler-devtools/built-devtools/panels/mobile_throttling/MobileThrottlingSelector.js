// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import { throttlingManager } from './ThrottlingManager.js';
import { ThrottlingPresets } from './ThrottlingPresets.js';
const UIStrings = {
    /**
    *@description Mobile throttling is disabled. The user can select this option to run mobile
    *emulation at a normal speed instead of throttled.
    */
    disabled: 'Disabled',
    /**
    *@description Title for a group of pre-decided configuration options for mobile throttling. These
    *are useful default options that users might want.
    */
    presets: 'Presets',
    /**
    *@description Title for a group of advanced configuration options for mobile throttling, which
    *might not be applicable to every user or situation.
    */
    advanced: 'Advanced',
};
const str_ = i18n.i18n.registerUIStrings('panels/mobile_throttling/MobileThrottlingSelector.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class MobileThrottlingSelector {
    populateCallback;
    selectCallback;
    options;
    constructor(populateCallback, selectCallback) {
        this.populateCallback = populateCallback;
        this.selectCallback = selectCallback;
        SDK.CPUThrottlingManager.CPUThrottlingManager.instance().addEventListener(SDK.CPUThrottlingManager.Events.RateChanged, this.conditionsChanged, this);
        SDK.NetworkManager.MultitargetNetworkManager.instance().addEventListener(SDK.NetworkManager.MultitargetNetworkManager.Events.ConditionsChanged, this.conditionsChanged, this);
        this.options = this.populateOptions();
        this.conditionsChanged();
    }
    optionSelected(conditions) {
        SDK.NetworkManager.MultitargetNetworkManager.instance().setNetworkConditions(conditions.network);
        throttlingManager().setCPUThrottlingRate(conditions.cpuThrottlingRate);
    }
    populateOptions() {
        const disabledGroup = {
            title: i18nString(UIStrings.disabled),
            items: [ThrottlingPresets.getNoThrottlingConditions()],
        };
        const presetsGroup = { title: i18nString(UIStrings.presets), items: ThrottlingPresets.getMobilePresets() };
        const advancedGroup = { title: i18nString(UIStrings.advanced), items: ThrottlingPresets.getAdvancedMobilePresets() };
        return this.populateCallback([disabledGroup, presetsGroup, advancedGroup]);
    }
    conditionsChanged() {
        const networkConditions = SDK.NetworkManager.MultitargetNetworkManager.instance().networkConditions();
        const cpuThrottlingRate = SDK.CPUThrottlingManager.CPUThrottlingManager.instance().cpuThrottlingRate();
        for (let index = 0; index < this.options.length; ++index) {
            const option = this.options[index];
            if (option && 'network' in option && option.network === networkConditions &&
                option.cpuThrottlingRate === cpuThrottlingRate) {
                this.selectCallback(index);
                return;
            }
        }
        const customConditions = ThrottlingPresets.getCustomConditions();
        for (let index = 0; index < this.options.length; ++index) {
            const item = this.options[index];
            if (item && item.title === customConditions.title && item.description === customConditions.description) {
                this.selectCallback(index);
                return;
            }
        }
    }
}
//# sourceMappingURL=MobileThrottlingSelector.js.map
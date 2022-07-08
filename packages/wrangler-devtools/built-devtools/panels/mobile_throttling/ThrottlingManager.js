// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import { MobileThrottlingSelector } from './MobileThrottlingSelector.js';
import { NetworkThrottlingSelector } from './NetworkThrottlingSelector.js';
import { ThrottlingPresets } from './ThrottlingPresets.js';
const UIStrings = {
    /**
    *@description Text with two placeholders separated by a colon
    *@example {Node removed} PH1
    *@example {div#id1} PH2
    */
    sS: '{PH1}: {PH2}',
    /**
    *@description Text in Throttling Manager of the Network panel
    */
    add: 'Add…',
    /**
    *@description Accessibility label for custom add network throttling option
    *@example {Custom} PH1
    */
    addS: 'Add {PH1}',
    /**
    *@description Text to indicate the network connectivity is offline
    */
    offline: 'Offline',
    /**
    *@description Text in Throttling Manager of the Network panel
    */
    forceDisconnectedFromNetwork: 'Force disconnected from network',
    /**
    *@description Text for throttling the network
    */
    throttling: 'Throttling',
    /**
    *@description Icon title in Throttling Manager of the Network panel
    */
    cpuThrottlingIsEnabled: 'CPU throttling is enabled',
    /**
    *@description Screen reader label for a select box that chooses the CPU throttling speed in the Performance panel
    */
    cpuThrottling: 'CPU throttling',
    /**
    *@description Text for no network throttling
    */
    noThrottling: 'No throttling',
    /**
    *@description Text in Throttling Manager of the Network panel
    *@example {2} PH1
    */
    dSlowdown: '{PH1}× slowdown',
    /**
    *@description Tooltip text in Throttling Manager of the Performance panel
    */
    excessConcurrency: 'Exceeding the default value may degrade system performance.',
    /**
    *@description Tooltip text in Throttling Manager of the Performance panel
    */
    resetConcurrency: 'Reset to the default value',
    /**
    *@description Screen reader label for an check box that neables overriding navigator.hardwareConcurrency
    */
    hardwareConcurrency: 'Hardware concurrency',
    /**
    *@description Screen reader label for an input box that overrides navigator.hardwareConcurrency
    */
    hardwareConcurrencyValue: 'Value of navigator.hardwareConcurrency',
    /**
    *@description Icon title in Throttling Manager of the Performance panel
    */
    hardwareConcurrencyIsEnabled: 'Hardware concurrency override is enabled',
};
const str_ = i18n.i18n.registerUIStrings('panels/mobile_throttling/ThrottlingManager.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
let throttlingManagerInstance;
export class ThrottlingManager {
    cpuThrottlingControls;
    cpuThrottlingRates;
    customNetworkConditionsSetting;
    currentNetworkThrottlingConditionsSetting;
    lastNetworkThrottlingConditions;
    cpuThrottlingManager;
    #hardwareConcurrencyOverrideEnabled = false;
    get hardwareConcurrencyOverrideEnabled() {
        return this.#hardwareConcurrencyOverrideEnabled;
    }
    constructor() {
        this.cpuThrottlingManager = SDK.CPUThrottlingManager.CPUThrottlingManager.instance();
        this.cpuThrottlingControls = new Set();
        this.cpuThrottlingRates = ThrottlingPresets.cpuThrottlingPresets;
        this.customNetworkConditionsSetting = Common.Settings.Settings.instance().moduleSetting('customNetworkConditions');
        this.currentNetworkThrottlingConditionsSetting = Common.Settings.Settings.instance().createSetting('preferredNetworkCondition', SDK.NetworkManager.NoThrottlingConditions);
        this.currentNetworkThrottlingConditionsSetting.setSerializer(new SDK.NetworkManager.ConditionsSerializer());
        SDK.NetworkManager.MultitargetNetworkManager.instance().addEventListener(SDK.NetworkManager.MultitargetNetworkManager.Events.ConditionsChanged, () => {
            this.lastNetworkThrottlingConditions = this.currentNetworkThrottlingConditionsSetting.get();
            this.currentNetworkThrottlingConditionsSetting.set(SDK.NetworkManager.MultitargetNetworkManager.instance().networkConditions());
        });
        if (this.isDirty()) {
            SDK.NetworkManager.MultitargetNetworkManager.instance().setNetworkConditions(this.currentNetworkThrottlingConditionsSetting.get());
        }
    }
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!throttlingManagerInstance || forceNew) {
            throttlingManagerInstance = new ThrottlingManager();
        }
        return throttlingManagerInstance;
    }
    decorateSelectWithNetworkThrottling(selectElement) {
        let options = [];
        const selector = new NetworkThrottlingSelector(populate, select, this.customNetworkConditionsSetting);
        selectElement.addEventListener('change', optionSelected, false);
        return selector;
        function populate(groups) {
            selectElement.removeChildren();
            options = [];
            for (let i = 0; i < groups.length; ++i) {
                const group = groups[i];
                const groupElement = selectElement.createChild('optgroup');
                groupElement.label = group.title;
                for (const conditions of group.items) {
                    // The title is usually an i18nLazyString except for custom values that are stored in the local storage in the form of a string.
                    const title = typeof conditions.title === 'function' ? conditions.title() : conditions.title;
                    const option = new Option(title, title);
                    UI.ARIAUtils.setAccessibleName(option, i18nString(UIStrings.sS, { PH1: group.title, PH2: title }));
                    groupElement.appendChild(option);
                    options.push(conditions);
                }
                if (i === groups.length - 1) {
                    const option = new Option(i18nString(UIStrings.add), i18nString(UIStrings.add));
                    UI.ARIAUtils.setAccessibleName(option, i18nString(UIStrings.addS, { PH1: group.title }));
                    groupElement.appendChild(option);
                    options.push(null);
                }
            }
            return options;
        }
        function optionSelected() {
            if (selectElement.selectedIndex === selectElement.options.length - 1) {
                selector.revealAndUpdate();
            }
            else {
                const option = options[selectElement.selectedIndex];
                if (option) {
                    selector.optionSelected(option);
                }
            }
        }
        function select(index) {
            if (selectElement.selectedIndex !== index) {
                selectElement.selectedIndex = index;
            }
        }
    }
    createOfflineToolbarCheckbox() {
        const checkbox = new UI.Toolbar.ToolbarCheckbox(i18nString(UIStrings.offline), i18nString(UIStrings.forceDisconnectedFromNetwork), forceOffline.bind(this));
        SDK.NetworkManager.MultitargetNetworkManager.instance().addEventListener(SDK.NetworkManager.MultitargetNetworkManager.Events.ConditionsChanged, networkConditionsChanged);
        checkbox.setChecked(SDK.NetworkManager.MultitargetNetworkManager.instance().networkConditions() ===
            SDK.NetworkManager.OfflineConditions);
        function forceOffline() {
            if (checkbox.checked()) {
                SDK.NetworkManager.MultitargetNetworkManager.instance().setNetworkConditions(SDK.NetworkManager.OfflineConditions);
            }
            else {
                SDK.NetworkManager.MultitargetNetworkManager.instance().setNetworkConditions(this.lastNetworkThrottlingConditions);
            }
        }
        function networkConditionsChanged() {
            checkbox.setChecked(SDK.NetworkManager.MultitargetNetworkManager.instance().networkConditions() ===
                SDK.NetworkManager.OfflineConditions);
        }
        return checkbox;
    }
    createMobileThrottlingButton() {
        const button = new UI.Toolbar.ToolbarMenuButton(appendItems);
        button.setTitle(i18nString(UIStrings.throttling));
        button.setGlyph('');
        button.turnIntoSelect();
        button.setDarkText();
        let options = [];
        let selectedIndex = -1;
        const selector = new MobileThrottlingSelector(populate, select);
        return button;
        function appendItems(contextMenu) {
            for (let index = 0; index < options.length; ++index) {
                const conditions = options[index];
                if (!conditions) {
                    continue;
                }
                if (conditions.title === ThrottlingPresets.getCustomConditions().title &&
                    conditions.description === ThrottlingPresets.getCustomConditions().description) {
                    continue;
                }
                contextMenu.defaultSection().appendCheckboxItem(conditions.title, selector.optionSelected.bind(selector, conditions), selectedIndex === index);
            }
        }
        function populate(groups) {
            options = [];
            for (const group of groups) {
                for (const conditions of group.items) {
                    options.push(conditions);
                }
                options.push(null);
            }
            return options;
        }
        function select(index) {
            selectedIndex = index;
            const option = options[index];
            if (option) {
                button.setText(option.title);
                button.setTitle(option.description);
            }
        }
    }
    updatePanelIcon() {
        const cpuRate = this.cpuThrottlingManager.cpuThrottlingRate();
        if (cpuRate === SDK.CPUThrottlingManager.CPUThrottlingRates.NoThrottling &&
            !this.hardwareConcurrencyOverrideEnabled) {
            UI.InspectorView.InspectorView.instance().setPanelIcon('timeline', null);
            return;
        }
        const icon = UI.Icon.Icon.create('smallicon-warning');
        const tooltips = [];
        if (cpuRate !== SDK.CPUThrottlingManager.CPUThrottlingRates.NoThrottling) {
            tooltips.push(i18nString(UIStrings.cpuThrottlingIsEnabled));
        }
        if (this.hardwareConcurrencyOverrideEnabled) {
            tooltips.push(i18nString(UIStrings.hardwareConcurrencyIsEnabled));
        }
        icon.title = tooltips.join('\n');
        UI.InspectorView.InspectorView.instance().setPanelIcon('timeline', icon);
    }
    setCPUThrottlingRate(rate) {
        this.cpuThrottlingManager.setCPUThrottlingRate(rate);
        if (rate !== SDK.CPUThrottlingManager.CPUThrottlingRates.NoThrottling) {
            Host.userMetrics.actionTaken(Host.UserMetrics.Action.CpuThrottlingEnabled);
        }
        const index = this.cpuThrottlingRates.indexOf(rate);
        for (const control of this.cpuThrottlingControls) {
            control.setSelectedIndex(index);
        }
        this.updatePanelIcon();
    }
    createCPUThrottlingSelector() {
        const control = new UI.Toolbar.ToolbarComboBox(event => this.setCPUThrottlingRate(this.cpuThrottlingRates[event.target.selectedIndex]), i18nString(UIStrings.cpuThrottling));
        this.cpuThrottlingControls.add(control);
        const currentRate = this.cpuThrottlingManager.cpuThrottlingRate();
        for (let i = 0; i < this.cpuThrottlingRates.length; ++i) {
            const rate = this.cpuThrottlingRates[i];
            const title = rate === 1 ? i18nString(UIStrings.noThrottling) : i18nString(UIStrings.dSlowdown, { PH1: rate });
            const option = control.createOption(title);
            control.addOption(option);
            if (currentRate === rate) {
                control.setSelectedIndex(i);
            }
        }
        return control;
    }
    createHardwareConcurrencySelector() {
        const input = new UI.Toolbar.ToolbarItem(UI.UIUtils.createInput('devtools-text-input', 'number'));
        input.setTitle(i18nString(UIStrings.hardwareConcurrencyValue));
        const inputElement = input.element;
        inputElement.min = '1';
        input.setEnabled(false);
        const toggle = new UI.Toolbar.ToolbarCheckbox(i18nString(UIStrings.hardwareConcurrency));
        const reset = new UI.Toolbar.ToolbarButton('Reset concurrency', 'largeicon-undo');
        reset.setTitle(i18nString(UIStrings.resetConcurrency));
        const warning = new UI.Toolbar.ToolbarItem(UI.Icon.Icon.create('smallicon-warning'));
        warning.setTitle(i18nString(UIStrings.excessConcurrency));
        toggle.inputElement.disabled = true; // Prevent modification while still wiring things up asynchronously below
        reset.element.classList.add('timeline-concurrency-hidden');
        warning.element.classList.add('timeline-concurrency-hidden');
        void this.cpuThrottlingManager.getHardwareConcurrency().then(defaultValue => {
            if (defaultValue === undefined) {
                return;
            }
            const setHardwareConcurrency = (value) => {
                if (value >= 1) {
                    this.cpuThrottlingManager.setHardwareConcurrency(value);
                }
                if (value > defaultValue) {
                    warning.element.classList.remove('timeline-concurrency-hidden');
                }
                else {
                    warning.element.classList.add('timeline-concurrency-hidden');
                }
                if (value === defaultValue) {
                    reset.element.classList.add('timeline-concurrency-hidden');
                }
                else {
                    reset.element.classList.remove('timeline-concurrency-hidden');
                }
            };
            inputElement.value = `${defaultValue}`;
            inputElement.oninput = () => setHardwareConcurrency(Number(inputElement.value));
            toggle.inputElement.disabled = false;
            toggle.inputElement.addEventListener('change', () => {
                this.#hardwareConcurrencyOverrideEnabled = toggle.checked();
                this.updatePanelIcon();
                input.setEnabled(this.hardwareConcurrencyOverrideEnabled);
                setHardwareConcurrency(this.hardwareConcurrencyOverrideEnabled ? Number(inputElement.value) : defaultValue);
            });
            reset.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, () => {
                inputElement.value = `${defaultValue}`;
                setHardwareConcurrency(defaultValue);
            });
        });
        return { input, reset, warning, toggle };
    }
    setHardwareConcurrency(concurrency) {
        this.cpuThrottlingManager.setHardwareConcurrency(concurrency);
    }
    isDirty() {
        const networkConditions = SDK.NetworkManager.MultitargetNetworkManager.instance().networkConditions();
        const knownCurrentConditions = this.currentNetworkThrottlingConditionsSetting.get();
        return !SDK.NetworkManager.networkConditionsEqual(networkConditions, knownCurrentConditions);
    }
}
let actionDelegateInstance;
export class ActionDelegate {
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!actionDelegateInstance || forceNew) {
            actionDelegateInstance = new ActionDelegate();
        }
        return actionDelegateInstance;
    }
    handleAction(context, actionId) {
        if (actionId === 'network-conditions.network-online') {
            SDK.NetworkManager.MultitargetNetworkManager.instance().setNetworkConditions(SDK.NetworkManager.NoThrottlingConditions);
            return true;
        }
        if (actionId === 'network-conditions.network-low-end-mobile') {
            SDK.NetworkManager.MultitargetNetworkManager.instance().setNetworkConditions(SDK.NetworkManager.Slow3GConditions);
            return true;
        }
        if (actionId === 'network-conditions.network-mid-tier-mobile') {
            SDK.NetworkManager.MultitargetNetworkManager.instance().setNetworkConditions(SDK.NetworkManager.Fast3GConditions);
            return true;
        }
        if (actionId === 'network-conditions.network-offline') {
            SDK.NetworkManager.MultitargetNetworkManager.instance().setNetworkConditions(SDK.NetworkManager.OfflineConditions);
            return true;
        }
        return false;
    }
}
export function throttlingManager() {
    return ThrottlingManager.instance();
}
//# sourceMappingURL=ThrottlingManager.js.map
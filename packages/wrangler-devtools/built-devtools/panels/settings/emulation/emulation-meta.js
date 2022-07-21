// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as UI from '../../../ui/legacy/legacy.js';
const UIStrings = {
    /**
    *@description Title of the Devices tab/tool. Devices refers to e.g. phones/tablets.
    */
    devices: 'Devices',
    /**
    *@description Command that opens the device emulation view.
    */
    showDevices: 'Show Devices',
};
const str_ = i18n.i18n.registerUIStrings('panels/settings/emulation/emulation-meta.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
let loadedEmulationModule;
async function loadEmulationModule() {
    if (!loadedEmulationModule) {
        loadedEmulationModule = await import('./emulation.js');
    }
    return loadedEmulationModule;
}
UI.ViewManager.registerViewExtension({
    location: "settings-view" /* SETTINGS_VIEW */,
    commandPrompt: i18nLazyString(UIStrings.showDevices),
    title: i18nLazyString(UIStrings.devices),
    order: 30,
    async loadView() {
        const Emulation = await loadEmulationModule();
        return Emulation.DevicesSettingsTab.DevicesSettingsTab.instance();
    },
    id: 'devices',
    settings: [
        'standardEmulatedDeviceList',
        'customEmulatedDeviceList',
    ],
});
//# sourceMappingURL=emulation-meta.js.map
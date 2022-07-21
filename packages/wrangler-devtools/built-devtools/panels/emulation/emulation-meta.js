// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Root from '../../core/root/root.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as i18n from '../../core/i18n/i18n.js';
const UIStrings = {
    /**
    *@description Title of an action in the emulation tool to toggle device mode
    */
    toggleDeviceToolbar: 'Toggle device toolbar',
    /**
    *@description Title of an action in the emulation tool to capture screenshot
    */
    captureScreenshot: 'Capture screenshot',
    /**
    * @description Title of an action in the emulation tool to capture full height screenshot. This
    * action captures a screenshot of the entire website, not just the visible portion.
    */
    captureFullSizeScreenshot: 'Capture full size screenshot',
    /**
    * @description Title of an action in the emulation tool to capture a screenshot of just this node.
    * Node refers to a HTML element/node.
    */
    captureNodeScreenshot: 'Capture node screenshot',
    /**
    * @description Command in the Device Mode Toolbar, to show media query boundaries in the UI.
    * https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries/Using_media_queries
    */
    showMediaQueries: 'Show media queries',
    /**
    * @description A tag of Mobile related settings that can be searched in the command menu if the
    * user doesn't know the exact name of the tool. Device refers to e.g. phone/tablet.
    */
    device: 'device',
    /**
    *@description Command in the Device Mode Toolbar, to hide media query boundaries in the UI.
    * https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries/Using_media_queries
    */
    hideMediaQueries: 'Hide media queries',
    /**
    *@description Command that shows measuring rulers next to the emulated device.
    */
    showRulers: 'Show rulers in the Device Mode toolbar',
    /**
    *@description Command that hides measuring rulers next to the emulated device.
    */
    hideRulers: 'Hide rulers in the Device Mode toolbar',
    /**
    *@description Command that shows a frame (like a picture frame) around the emulated device.
    */
    showDeviceFrame: 'Show device frame',
    /**
    *@description Command that hides a frame (like a picture frame) around the emulated device.
    */
    hideDeviceFrame: 'Hide device frame',
};
const str_ = i18n.i18n.registerUIStrings('panels/emulation/emulation-meta.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);
let loadedEmulationModule;
async function loadEmulationModule() {
    if (!loadedEmulationModule) {
        loadedEmulationModule = await import('./emulation.js');
    }
    return loadedEmulationModule;
}
UI.ActionRegistration.registerActionExtension({
    category: UI.ActionRegistration.ActionCategory.MOBILE,
    actionId: 'emulation.toggle-device-mode',
    toggleable: true,
    async loadActionDelegate() {
        const Emulation = await loadEmulationModule();
        return Emulation.DeviceModeWrapper.ActionDelegate.instance();
    },
    condition: Root.Runtime.ConditionName.CAN_DOCK,
    title: i18nLazyString(UIStrings.toggleDeviceToolbar),
    iconClass: "largeicon-phone" /* LARGEICON_PHONE */,
    bindings: [
        {
            platform: "windows,linux" /* WindowsLinux */,
            shortcut: 'Shift+Ctrl+M',
        },
        {
            platform: "mac" /* Mac */,
            shortcut: 'Shift+Meta+M',
        },
    ],
});
UI.ActionRegistration.registerActionExtension({
    actionId: 'emulation.capture-screenshot',
    category: UI.ActionRegistration.ActionCategory.SCREENSHOT,
    async loadActionDelegate() {
        const Emulation = await loadEmulationModule();
        return Emulation.DeviceModeWrapper.ActionDelegate.instance();
    },
    condition: Root.Runtime.ConditionName.CAN_DOCK,
    title: i18nLazyString(UIStrings.captureScreenshot),
});
UI.ActionRegistration.registerActionExtension({
    actionId: 'emulation.capture-full-height-screenshot',
    category: UI.ActionRegistration.ActionCategory.SCREENSHOT,
    async loadActionDelegate() {
        const Emulation = await loadEmulationModule();
        return Emulation.DeviceModeWrapper.ActionDelegate.instance();
    },
    condition: Root.Runtime.ConditionName.CAN_DOCK,
    title: i18nLazyString(UIStrings.captureFullSizeScreenshot),
});
UI.ActionRegistration.registerActionExtension({
    actionId: 'emulation.capture-node-screenshot',
    category: UI.ActionRegistration.ActionCategory.SCREENSHOT,
    async loadActionDelegate() {
        const Emulation = await loadEmulationModule();
        return Emulation.DeviceModeWrapper.ActionDelegate.instance();
    },
    condition: Root.Runtime.ConditionName.CAN_DOCK,
    title: i18nLazyString(UIStrings.captureNodeScreenshot),
});
Common.Settings.registerSettingExtension({
    category: Common.Settings.SettingCategory.MOBILE,
    settingName: 'showMediaQueryInspector',
    settingType: Common.Settings.SettingType.BOOLEAN,
    defaultValue: false,
    options: [
        {
            value: true,
            title: i18nLazyString(UIStrings.showMediaQueries),
        },
        {
            value: false,
            title: i18nLazyString(UIStrings.hideMediaQueries),
        },
    ],
    tags: [i18nLazyString(UIStrings.device)],
});
Common.Settings.registerSettingExtension({
    category: Common.Settings.SettingCategory.MOBILE,
    settingName: 'emulation.showRulers',
    settingType: Common.Settings.SettingType.BOOLEAN,
    defaultValue: false,
    options: [
        {
            value: true,
            title: i18nLazyString(UIStrings.showRulers),
        },
        {
            value: false,
            title: i18nLazyString(UIStrings.hideRulers),
        },
    ],
    tags: [i18nLazyString(UIStrings.device)],
});
Common.Settings.registerSettingExtension({
    category: Common.Settings.SettingCategory.MOBILE,
    settingName: 'emulation.showDeviceOutline',
    settingType: Common.Settings.SettingType.BOOLEAN,
    defaultValue: false,
    options: [
        {
            value: true,
            title: i18nLazyString(UIStrings.showDeviceFrame),
        },
        {
            value: false,
            title: i18nLazyString(UIStrings.hideDeviceFrame),
        },
    ],
    tags: [i18nLazyString(UIStrings.device)],
});
UI.Toolbar.registerToolbarItem({
    actionId: 'emulation.toggle-device-mode',
    condition: Root.Runtime.ConditionName.CAN_DOCK,
    location: UI.Toolbar.ToolbarItemLocation.MAIN_TOOLBAR_LEFT,
    order: 1,
    showLabel: undefined,
    loadItem: undefined,
    separator: undefined,
});
Common.AppProvider.registerAppProvider({
    async loadAppProvider() {
        const Emulation = await loadEmulationModule();
        return Emulation.AdvancedApp.AdvancedAppProvider.instance();
    },
    condition: Root.Runtime.ConditionName.CAN_DOCK,
    order: 0,
});
UI.ContextMenu.registerItem({
    location: UI.ContextMenu.ItemLocation.DEVICE_MODE_MENU_SAVE,
    order: 12,
    actionId: 'emulation.capture-screenshot',
});
UI.ContextMenu.registerItem({
    location: UI.ContextMenu.ItemLocation.DEVICE_MODE_MENU_SAVE,
    order: 13,
    actionId: 'emulation.capture-full-height-screenshot',
});
//# sourceMappingURL=emulation-meta.js.map
// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import { Horizontal, HorizontalSpanned, Vertical, VerticalSpanned } from './EmulatedDevices.js';
const UIStrings = {
    /**
    * @description Error message shown in the Devices settings pane when the user enters an invalid
    * width for a custom device.
    */
    widthMustBeANumber: 'Width must be a number.',
    /**
    * @description Error message shown in the Devices settings pane when the user has entered a width
    * for a custom device that is too large.
    * @example {9999} PH1
    */
    widthMustBeLessThanOrEqualToS: 'Width must be less than or equal to {PH1}.',
    /**
    * @description Error message shown in the Devices settings pane when the user has entered a width
    * for a custom device that is too small.
    * @example {50} PH1
    */
    widthMustBeGreaterThanOrEqualToS: 'Width must be greater than or equal to {PH1}.',
    /**
    * @description Error message shown in the Devices settings pane when the user enters an invalid
    * height for a custom device.
    */
    heightMustBeANumber: 'Height must be a number.',
    /**
    * @description Error message shown in the Devices settings pane when the user has entered a height
    * for a custom device that is too large.
    * @example {9999} PH1
    */
    heightMustBeLessThanOrEqualToS: 'Height must be less than or equal to {PH1}.',
    /**
    * @description Error message shown in the Devices settings pane when the user has entered a height
    * for a custom device that is too small.
    * @example {50} PH1
    */
    heightMustBeGreaterThanOrEqualTo: 'Height must be greater than or equal to {PH1}.',
    /**
    * @description Error message shown in the Devices settings pane when the user enters an invalid
    * device pixel ratio for a custom device.
    */
    devicePixelRatioMustBeANumberOr: 'Device pixel ratio must be a number or blank.',
    /**
    * @description Error message shown in the Devices settings pane when the user enters a device
    * pixel ratio for a custom device that is too large.
    * @example {10} PH1
    */
    devicePixelRatioMustBeLessThanOr: 'Device pixel ratio must be less than or equal to {PH1}.',
    /**
    * @description Error message shown in the Devices settings pane when the user enters a device
    * pixel ratio for a custom device that is too small.
    * @example {0} PH1
    */
    devicePixelRatioMustBeGreater: 'Device pixel ratio must be greater than or equal to {PH1}.',
};
const str_ = i18n.i18n.registerUIStrings('models/emulation/DeviceModeModel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
let deviceModeModelInstance;
export class DeviceModeModel extends Common.ObjectWrapper.ObjectWrapper {
    #screenRectInternal;
    #visiblePageRectInternal;
    #availableSize;
    #preferredSize;
    #initialized;
    #appliedDeviceSizeInternal;
    #appliedDeviceScaleFactorInternal;
    #appliedUserAgentTypeInternal;
    #experimentDualScreenSupport;
    #webPlatformExperimentalFeaturesEnabledInternal;
    #scaleSettingInternal;
    #scaleInternal;
    #widthSetting;
    #heightSetting;
    #uaSettingInternal;
    #deviceScaleFactorSettingInternal;
    #deviceOutlineSettingInternal;
    #toolbarControlsEnabledSettingInternal;
    #typeInternal;
    #deviceInternal;
    #modeInternal;
    #fitScaleInternal;
    #touchEnabled;
    #touchMobile;
    #emulationModel;
    #onModelAvailable;
    #outlineRectInternal;
    constructor() {
        super();
        this.#screenRectInternal = new Rect(0, 0, 1, 1);
        this.#visiblePageRectInternal = new Rect(0, 0, 1, 1);
        this.#availableSize = new UI.Geometry.Size(1, 1);
        this.#preferredSize = new UI.Geometry.Size(1, 1);
        this.#initialized = false;
        this.#appliedDeviceSizeInternal = new UI.Geometry.Size(1, 1);
        this.#appliedDeviceScaleFactorInternal = window.devicePixelRatio;
        this.#appliedUserAgentTypeInternal = UA.Desktop;
        this.#experimentDualScreenSupport = Root.Runtime.experiments.isEnabled('dualScreenSupport');
        this.#webPlatformExperimentalFeaturesEnabledInternal = 'segments' in window.visualViewport;
        this.#scaleSettingInternal = Common.Settings.Settings.instance().createSetting('emulation.deviceScale', 1);
        // We've used to allow zero before.
        if (!this.#scaleSettingInternal.get()) {
            this.#scaleSettingInternal.set(1);
        }
        this.#scaleSettingInternal.addChangeListener(this.scaleSettingChanged, this);
        this.#scaleInternal = 1;
        this.#widthSetting = Common.Settings.Settings.instance().createSetting('emulation.deviceWidth', 400);
        if (this.#widthSetting.get() < MinDeviceSize) {
            this.#widthSetting.set(MinDeviceSize);
        }
        if (this.#widthSetting.get() > MaxDeviceSize) {
            this.#widthSetting.set(MaxDeviceSize);
        }
        this.#widthSetting.addChangeListener(this.widthSettingChanged, this);
        this.#heightSetting = Common.Settings.Settings.instance().createSetting('emulation.deviceHeight', 0);
        if (this.#heightSetting.get() && this.#heightSetting.get() < MinDeviceSize) {
            this.#heightSetting.set(MinDeviceSize);
        }
        if (this.#heightSetting.get() > MaxDeviceSize) {
            this.#heightSetting.set(MaxDeviceSize);
        }
        this.#heightSetting.addChangeListener(this.heightSettingChanged, this);
        this.#uaSettingInternal = Common.Settings.Settings.instance().createSetting('emulation.deviceUA', UA.Mobile);
        this.#uaSettingInternal.addChangeListener(this.uaSettingChanged, this);
        this.#deviceScaleFactorSettingInternal =
            Common.Settings.Settings.instance().createSetting('emulation.deviceScaleFactor', 0);
        this.#deviceScaleFactorSettingInternal.addChangeListener(this.deviceScaleFactorSettingChanged, this);
        this.#deviceOutlineSettingInternal =
            Common.Settings.Settings.instance().moduleSetting('emulation.showDeviceOutline');
        this.#deviceOutlineSettingInternal.addChangeListener(this.deviceOutlineSettingChanged, this);
        this.#toolbarControlsEnabledSettingInternal = Common.Settings.Settings.instance().createSetting('emulation.toolbarControlsEnabled', true, Common.Settings.SettingStorageType.Session);
        this.#typeInternal = Type.None;
        this.#deviceInternal = null;
        this.#modeInternal = null;
        this.#fitScaleInternal = 1;
        this.#touchEnabled = false;
        this.#touchMobile = false;
        this.#emulationModel = null;
        this.#onModelAvailable = null;
        SDK.TargetManager.TargetManager.instance().observeModels(SDK.EmulationModel.EmulationModel, this);
    }
    static instance(opts = { forceNew: null }) {
        if (!deviceModeModelInstance || opts.forceNew) {
            deviceModeModelInstance = new DeviceModeModel();
        }
        return deviceModeModelInstance;
    }
    static widthValidator(value) {
        let valid = false;
        let errorMessage;
        if (!/^[\d]+$/.test(value)) {
            errorMessage = i18nString(UIStrings.widthMustBeANumber);
        }
        else if (Number(value) > MaxDeviceSize) {
            errorMessage = i18nString(UIStrings.widthMustBeLessThanOrEqualToS, { PH1: MaxDeviceSize });
        }
        else if (Number(value) < MinDeviceSize) {
            errorMessage = i18nString(UIStrings.widthMustBeGreaterThanOrEqualToS, { PH1: MinDeviceSize });
        }
        else {
            valid = true;
        }
        return { valid, errorMessage };
    }
    static heightValidator(value) {
        let valid = false;
        let errorMessage;
        if (!/^[\d]+$/.test(value)) {
            errorMessage = i18nString(UIStrings.heightMustBeANumber);
        }
        else if (Number(value) > MaxDeviceSize) {
            errorMessage = i18nString(UIStrings.heightMustBeLessThanOrEqualToS, { PH1: MaxDeviceSize });
        }
        else if (Number(value) < MinDeviceSize) {
            errorMessage = i18nString(UIStrings.heightMustBeGreaterThanOrEqualTo, { PH1: MinDeviceSize });
        }
        else {
            valid = true;
        }
        return { valid, errorMessage };
    }
    static scaleValidator(value) {
        let valid = false;
        let errorMessage;
        const parsedValue = Number(value.trim());
        if (!value) {
            valid = true;
        }
        else if (Number.isNaN(parsedValue)) {
            errorMessage = i18nString(UIStrings.devicePixelRatioMustBeANumberOr);
        }
        else if (Number(value) > MaxDeviceScaleFactor) {
            errorMessage = i18nString(UIStrings.devicePixelRatioMustBeLessThanOr, { PH1: MaxDeviceScaleFactor });
        }
        else if (Number(value) < MinDeviceScaleFactor) {
            errorMessage = i18nString(UIStrings.devicePixelRatioMustBeGreater, { PH1: MinDeviceScaleFactor });
        }
        else {
            valid = true;
        }
        return { valid, errorMessage };
    }
    get scaleSettingInternal() {
        return this.#scaleSettingInternal;
    }
    setAvailableSize(availableSize, preferredSize) {
        this.#availableSize = availableSize;
        this.#preferredSize = preferredSize;
        this.#initialized = true;
        this.calculateAndEmulate(false);
    }
    emulate(type, device, mode, scale) {
        const resetPageScaleFactor = this.#typeInternal !== type || this.#deviceInternal !== device || this.#modeInternal !== mode;
        this.#typeInternal = type;
        if (type === Type.Device && device && mode) {
            console.assert(Boolean(device) && Boolean(mode), 'Must pass device and mode for device emulation');
            this.#modeInternal = mode;
            this.#deviceInternal = device;
            if (this.#initialized) {
                const orientation = device.orientationByName(mode.orientation);
                this.#scaleSettingInternal.set(scale ||
                    this.calculateFitScale(orientation.width, orientation.height, this.currentOutline(), this.currentInsets()));
            }
        }
        else {
            this.#deviceInternal = null;
            this.#modeInternal = null;
        }
        if (type !== Type.None) {
            Host.userMetrics.actionTaken(Host.UserMetrics.Action.DeviceModeEnabled);
        }
        this.calculateAndEmulate(resetPageScaleFactor);
    }
    setWidth(width) {
        const max = Math.min(MaxDeviceSize, this.preferredScaledWidth());
        width = Math.max(Math.min(width, max), 1);
        this.#widthSetting.set(width);
    }
    setWidthAndScaleToFit(width) {
        width = Math.max(Math.min(width, MaxDeviceSize), 1);
        this.#scaleSettingInternal.set(this.calculateFitScale(width, this.#heightSetting.get()));
        this.#widthSetting.set(width);
    }
    setHeight(height) {
        const max = Math.min(MaxDeviceSize, this.preferredScaledHeight());
        height = Math.max(Math.min(height, max), 0);
        if (height === this.preferredScaledHeight()) {
            height = 0;
        }
        this.#heightSetting.set(height);
    }
    setHeightAndScaleToFit(height) {
        height = Math.max(Math.min(height, MaxDeviceSize), 0);
        this.#scaleSettingInternal.set(this.calculateFitScale(this.#widthSetting.get(), height));
        this.#heightSetting.set(height);
    }
    setScale(scale) {
        this.#scaleSettingInternal.set(scale);
    }
    device() {
        return this.#deviceInternal;
    }
    mode() {
        return this.#modeInternal;
    }
    type() {
        return this.#typeInternal;
    }
    screenImage() {
        return (this.#deviceInternal && this.#modeInternal) ? this.#deviceInternal.modeImage(this.#modeInternal) : '';
    }
    outlineImage() {
        return (this.#deviceInternal && this.#modeInternal && this.#deviceOutlineSettingInternal.get()) ?
            this.#deviceInternal.outlineImage(this.#modeInternal) :
            '';
    }
    outlineRect() {
        return this.#outlineRectInternal || null;
    }
    screenRect() {
        return this.#screenRectInternal;
    }
    visiblePageRect() {
        return this.#visiblePageRectInternal;
    }
    scale() {
        return this.#scaleInternal;
    }
    fitScale() {
        return this.#fitScaleInternal;
    }
    appliedDeviceSize() {
        return this.#appliedDeviceSizeInternal;
    }
    appliedDeviceScaleFactor() {
        return this.#appliedDeviceScaleFactorInternal;
    }
    appliedUserAgentType() {
        return this.#appliedUserAgentTypeInternal;
    }
    isFullHeight() {
        return !this.#heightSetting.get();
    }
    isMobile() {
        switch (this.#typeInternal) {
            case Type.Device:
                return this.#deviceInternal ? this.#deviceInternal.mobile() : false;
            case Type.None:
                return false;
            case Type.Responsive:
                return this.#uaSettingInternal.get() === UA.Mobile || this.#uaSettingInternal.get() === UA.MobileNoTouch;
        }
        return false;
    }
    enabledSetting() {
        return Common.Settings.Settings.instance().createSetting('emulation.showDeviceMode', false);
    }
    scaleSetting() {
        return this.#scaleSettingInternal;
    }
    uaSetting() {
        return this.#uaSettingInternal;
    }
    deviceScaleFactorSetting() {
        return this.#deviceScaleFactorSettingInternal;
    }
    deviceOutlineSetting() {
        return this.#deviceOutlineSettingInternal;
    }
    toolbarControlsEnabledSetting() {
        return this.#toolbarControlsEnabledSettingInternal;
    }
    reset() {
        this.#deviceScaleFactorSettingInternal.set(0);
        this.#scaleSettingInternal.set(1);
        this.setWidth(400);
        this.setHeight(0);
        this.#uaSettingInternal.set(UA.Mobile);
    }
    modelAdded(emulationModel) {
        if (!this.#emulationModel && emulationModel.supportsDeviceEmulation()) {
            this.#emulationModel = emulationModel;
            if (this.#onModelAvailable) {
                const callback = this.#onModelAvailable;
                this.#onModelAvailable = null;
                callback();
            }
            const resourceTreeModel = emulationModel.target().model(SDK.ResourceTreeModel.ResourceTreeModel);
            if (resourceTreeModel) {
                resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.FrameResized, this.onFrameChange, this);
                resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.FrameNavigated, this.onFrameChange, this);
            }
        }
        else {
            void emulationModel.emulateTouch(this.#touchEnabled, this.#touchMobile);
        }
    }
    modelRemoved(emulationModel) {
        if (this.#emulationModel === emulationModel) {
            this.#emulationModel = null;
        }
    }
    inspectedURL() {
        return this.#emulationModel ? this.#emulationModel.target().inspectedURL() : null;
    }
    onFrameChange() {
        const overlayModel = this.#emulationModel ? this.#emulationModel.overlayModel() : null;
        if (!overlayModel) {
            return;
        }
        this.showHingeIfApplicable(overlayModel);
    }
    scaleSettingChanged() {
        this.calculateAndEmulate(false);
    }
    widthSettingChanged() {
        this.calculateAndEmulate(false);
    }
    heightSettingChanged() {
        this.calculateAndEmulate(false);
    }
    uaSettingChanged() {
        this.calculateAndEmulate(true);
    }
    deviceScaleFactorSettingChanged() {
        this.calculateAndEmulate(false);
    }
    deviceOutlineSettingChanged() {
        this.calculateAndEmulate(false);
    }
    preferredScaledWidth() {
        return Math.floor(this.#preferredSize.width / (this.#scaleSettingInternal.get() || 1));
    }
    preferredScaledHeight() {
        return Math.floor(this.#preferredSize.height / (this.#scaleSettingInternal.get() || 1));
    }
    currentOutline() {
        let outline = new Insets(0, 0, 0, 0);
        if (this.#typeInternal !== Type.Device || !this.#deviceInternal || !this.#modeInternal) {
            return outline;
        }
        const orientation = this.#deviceInternal.orientationByName(this.#modeInternal.orientation);
        if (this.#deviceOutlineSettingInternal.get()) {
            outline = orientation.outlineInsets || outline;
        }
        return outline;
    }
    currentInsets() {
        if (this.#typeInternal !== Type.Device || !this.#modeInternal) {
            return new Insets(0, 0, 0, 0);
        }
        return this.#modeInternal.insets;
    }
    getScreenOrientationType() {
        if (!this.#modeInternal) {
            throw new Error('Mode required to get orientation type.');
        }
        switch (this.#modeInternal.orientation) {
            case VerticalSpanned:
            case Vertical:
                return "portraitPrimary" /* PortraitPrimary */;
            case HorizontalSpanned:
            case Horizontal:
            default:
                return "landscapePrimary" /* LandscapePrimary */;
        }
    }
    calculateAndEmulate(resetPageScaleFactor) {
        if (!this.#emulationModel) {
            this.#onModelAvailable = this.calculateAndEmulate.bind(this, resetPageScaleFactor);
        }
        const mobile = this.isMobile();
        const overlayModel = this.#emulationModel ? this.#emulationModel.overlayModel() : null;
        if (overlayModel) {
            this.showHingeIfApplicable(overlayModel);
        }
        if (this.#typeInternal === Type.Device && this.#deviceInternal && this.#modeInternal) {
            const orientation = this.#deviceInternal.orientationByName(this.#modeInternal.orientation);
            const outline = this.currentOutline();
            const insets = this.currentInsets();
            this.#fitScaleInternal = this.calculateFitScale(orientation.width, orientation.height, outline, insets);
            if (mobile) {
                this.#appliedUserAgentTypeInternal = this.#deviceInternal.touch() ? UA.Mobile : UA.MobileNoTouch;
            }
            else {
                this.#appliedUserAgentTypeInternal = this.#deviceInternal.touch() ? UA.DesktopTouch : UA.Desktop;
            }
            this.applyDeviceMetrics(new UI.Geometry.Size(orientation.width, orientation.height), insets, outline, this.#scaleSettingInternal.get(), this.#deviceInternal.deviceScaleFactor, mobile, this.getScreenOrientationType(), resetPageScaleFactor, this.#webPlatformExperimentalFeaturesEnabledInternal);
            this.applyUserAgent(this.#deviceInternal.userAgent, this.#deviceInternal.userAgentMetadata);
            this.applyTouch(this.#deviceInternal.touch(), mobile);
        }
        else if (this.#typeInternal === Type.None) {
            this.#fitScaleInternal = this.calculateFitScale(this.#availableSize.width, this.#availableSize.height);
            this.#appliedUserAgentTypeInternal = UA.Desktop;
            this.applyDeviceMetrics(this.#availableSize, new Insets(0, 0, 0, 0), new Insets(0, 0, 0, 0), 1, 0, mobile, null, resetPageScaleFactor);
            this.applyUserAgent('', null);
            this.applyTouch(false, false);
        }
        else if (this.#typeInternal === Type.Responsive) {
            let screenWidth = this.#widthSetting.get();
            if (!screenWidth || screenWidth > this.preferredScaledWidth()) {
                screenWidth = this.preferredScaledWidth();
            }
            let screenHeight = this.#heightSetting.get();
            if (!screenHeight || screenHeight > this.preferredScaledHeight()) {
                screenHeight = this.preferredScaledHeight();
            }
            const defaultDeviceScaleFactor = mobile ? defaultMobileScaleFactor : 0;
            this.#fitScaleInternal = this.calculateFitScale(this.#widthSetting.get(), this.#heightSetting.get());
            this.#appliedUserAgentTypeInternal = this.#uaSettingInternal.get();
            this.applyDeviceMetrics(new UI.Geometry.Size(screenWidth, screenHeight), new Insets(0, 0, 0, 0), new Insets(0, 0, 0, 0), this.#scaleSettingInternal.get(), this.#deviceScaleFactorSettingInternal.get() || defaultDeviceScaleFactor, mobile, screenHeight >= screenWidth ? "portraitPrimary" /* PortraitPrimary */ :
                "landscapePrimary" /* LandscapePrimary */, resetPageScaleFactor);
            this.applyUserAgent(mobile ? defaultMobileUserAgent : '', mobile ? defaultMobileUserAgentMetadata : null);
            this.applyTouch(this.#uaSettingInternal.get() === UA.DesktopTouch || this.#uaSettingInternal.get() === UA.Mobile, this.#uaSettingInternal.get() === UA.Mobile);
        }
        if (overlayModel) {
            overlayModel.setShowViewportSizeOnResize(this.#typeInternal === Type.None);
        }
        this.dispatchEventToListeners("Updated" /* Updated */);
    }
    calculateFitScale(screenWidth, screenHeight, outline, insets) {
        const outlineWidth = outline ? outline.left + outline.right : 0;
        const outlineHeight = outline ? outline.top + outline.bottom : 0;
        const insetsWidth = insets ? insets.left + insets.right : 0;
        const insetsHeight = insets ? insets.top + insets.bottom : 0;
        let scale = Math.min(screenWidth ? this.#preferredSize.width / (screenWidth + outlineWidth) : 1, screenHeight ? this.#preferredSize.height / (screenHeight + outlineHeight) : 1);
        scale = Math.min(Math.floor(scale * 100), 100);
        let sharpScale = scale;
        while (sharpScale > scale * 0.7) {
            let sharp = true;
            if (screenWidth) {
                sharp = sharp && Number.isInteger((screenWidth - insetsWidth) * sharpScale / 100);
            }
            if (screenHeight) {
                sharp = sharp && Number.isInteger((screenHeight - insetsHeight) * sharpScale / 100);
            }
            if (sharp) {
                return sharpScale / 100;
            }
            sharpScale -= 1;
        }
        return scale / 100;
    }
    setSizeAndScaleToFit(width, height) {
        this.#scaleSettingInternal.set(this.calculateFitScale(width, height));
        this.setWidth(width);
        this.setHeight(height);
    }
    applyUserAgent(userAgent, userAgentMetadata) {
        SDK.NetworkManager.MultitargetNetworkManager.instance().setUserAgentOverride(userAgent, userAgentMetadata);
    }
    applyDeviceMetrics(screenSize, insets, outline, scale, deviceScaleFactor, mobile, screenOrientation, resetPageScaleFactor, forceMetricsOverride = false) {
        screenSize.width = Math.max(1, Math.floor(screenSize.width));
        screenSize.height = Math.max(1, Math.floor(screenSize.height));
        let pageWidth = screenSize.width - insets.left - insets.right;
        let pageHeight = screenSize.height - insets.top - insets.bottom;
        const positionX = insets.left;
        const positionY = insets.top;
        const screenOrientationAngle = screenOrientation === "landscapePrimary" /* LandscapePrimary */ ? 90 : 0;
        this.#appliedDeviceSizeInternal = screenSize;
        this.#appliedDeviceScaleFactorInternal = deviceScaleFactor || window.devicePixelRatio;
        this.#screenRectInternal = new Rect(Math.max(0, (this.#availableSize.width - screenSize.width * scale) / 2), outline.top * scale, screenSize.width * scale, screenSize.height * scale);
        this.#outlineRectInternal = new Rect(this.#screenRectInternal.left - outline.left * scale, 0, (outline.left + screenSize.width + outline.right) * scale, (outline.top + screenSize.height + outline.bottom) * scale);
        this.#visiblePageRectInternal = new Rect(positionX * scale, positionY * scale, Math.min(pageWidth * scale, this.#availableSize.width - this.#screenRectInternal.left - positionX * scale), Math.min(pageHeight * scale, this.#availableSize.height - this.#screenRectInternal.top - positionY * scale));
        this.#scaleInternal = scale;
        if (!forceMetricsOverride) {
            // When sending displayFeature, we cannot use the optimization below due to backend restrictions.
            if (scale === 1 && this.#availableSize.width >= screenSize.width &&
                this.#availableSize.height >= screenSize.height) {
                // When we have enough space, no page size override is required. This will speed things up and remove lag.
                pageWidth = 0;
                pageHeight = 0;
            }
            if (this.#visiblePageRectInternal.width === pageWidth * scale &&
                this.#visiblePageRectInternal.height === pageHeight * scale && Number.isInteger(pageWidth * scale) &&
                Number.isInteger(pageHeight * scale)) {
                // When we only have to apply scale, do not resize the page. This will speed things up and remove lag.
                pageWidth = 0;
                pageHeight = 0;
            }
        }
        if (!this.#emulationModel) {
            return;
        }
        if (resetPageScaleFactor) {
            void this.#emulationModel.resetPageScaleFactor();
        }
        if (pageWidth || pageHeight || mobile || deviceScaleFactor || scale !== 1 || screenOrientation ||
            forceMetricsOverride) {
            const metrics = {
                width: pageWidth,
                height: pageHeight,
                deviceScaleFactor: deviceScaleFactor,
                mobile: mobile,
                scale: scale,
                screenWidth: screenSize.width,
                screenHeight: screenSize.height,
                positionX: positionX,
                positionY: positionY,
                dontSetVisibleSize: true,
                displayFeature: undefined,
                screenOrientation: undefined,
            };
            const displayFeature = this.getDisplayFeature();
            if (displayFeature) {
                metrics.displayFeature = displayFeature;
            }
            if (screenOrientation) {
                metrics.screenOrientation = { type: screenOrientation, angle: screenOrientationAngle };
            }
            void this.#emulationModel.emulateDevice(metrics);
        }
        else {
            void this.#emulationModel.emulateDevice(null);
        }
    }
    exitHingeMode() {
        const overlayModel = this.#emulationModel ? this.#emulationModel.overlayModel() : null;
        if (overlayModel) {
            overlayModel.showHingeForDualScreen(null);
        }
    }
    webPlatformExperimentalFeaturesEnabled() {
        return this.#webPlatformExperimentalFeaturesEnabledInternal;
    }
    shouldReportDisplayFeature() {
        return this.#webPlatformExperimentalFeaturesEnabledInternal && this.#experimentDualScreenSupport;
    }
    async captureScreenshot(fullSize, clip) {
        const screenCaptureModel = this.#emulationModel ? this.#emulationModel.target().model(SDK.ScreenCaptureModel.ScreenCaptureModel) : null;
        if (!screenCaptureModel) {
            return null;
        }
        const overlayModel = this.#emulationModel ? this.#emulationModel.overlayModel() : null;
        if (overlayModel) {
            overlayModel.setShowViewportSizeOnResize(false);
        }
        // Define the right clipping area for fullsize screenshots.
        if (fullSize) {
            const metrics = await screenCaptureModel.fetchLayoutMetrics();
            if (!metrics) {
                return null;
            }
            // Cap the height to not hit the GPU limit.
            const contentHeight = Math.min((1 << 14), metrics.contentHeight);
            clip = { x: 0, y: 0, width: Math.floor(metrics.contentWidth), height: Math.floor(contentHeight), scale: 1 };
        }
        const screenshot = await screenCaptureModel.captureScreenshot("png" /* Png */, 100, clip);
        const deviceMetrics = {
            width: 0,
            height: 0,
            deviceScaleFactor: 0,
            mobile: false,
        };
        if (fullSize && this.#emulationModel) {
            if (this.#deviceInternal && this.#modeInternal) {
                const orientation = this.#deviceInternal.orientationByName(this.#modeInternal.orientation);
                deviceMetrics.width = orientation.width;
                deviceMetrics.height = orientation.height;
                const dispFeature = this.getDisplayFeature();
                if (dispFeature) {
                    // @ts-ignore: displayFeature isn't in protocol.d.ts but is an
                    // experimental flag:
                    // https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setDeviceMetricsOverride
                    deviceMetrics.displayFeature = dispFeature;
                }
            }
            else {
                deviceMetrics.width = 0;
                deviceMetrics.height = 0;
            }
            await this.#emulationModel.emulateDevice(deviceMetrics);
        }
        this.calculateAndEmulate(false);
        return screenshot;
    }
    applyTouch(touchEnabled, mobile) {
        this.#touchEnabled = touchEnabled;
        this.#touchMobile = mobile;
        for (const emulationModel of SDK.TargetManager.TargetManager.instance().models(SDK.EmulationModel.EmulationModel)) {
            void emulationModel.emulateTouch(touchEnabled, mobile);
        }
    }
    showHingeIfApplicable(overlayModel) {
        const orientation = (this.#deviceInternal && this.#modeInternal) ?
            this.#deviceInternal.orientationByName(this.#modeInternal.orientation) :
            null;
        if (this.#experimentDualScreenSupport && orientation && orientation.hinge) {
            overlayModel.showHingeForDualScreen(orientation.hinge);
            return;
        }
        overlayModel.showHingeForDualScreen(null);
    }
    getDisplayFeatureOrientation() {
        if (!this.#modeInternal) {
            throw new Error('Mode required to get display feature orientation.');
        }
        switch (this.#modeInternal.orientation) {
            case VerticalSpanned:
            case Vertical:
                return "vertical" /* Vertical */;
            case HorizontalSpanned:
            case Horizontal:
            default:
                return "horizontal" /* Horizontal */;
        }
    }
    getDisplayFeature() {
        if (!this.shouldReportDisplayFeature()) {
            return null;
        }
        if (!this.#deviceInternal || !this.#modeInternal ||
            (this.#modeInternal.orientation !== VerticalSpanned && this.#modeInternal.orientation !== HorizontalSpanned)) {
            return null;
        }
        const orientation = this.#deviceInternal.orientationByName(this.#modeInternal.orientation);
        if (!orientation || !orientation.hinge) {
            return null;
        }
        const hinge = orientation.hinge;
        return {
            orientation: this.getDisplayFeatureOrientation(),
            offset: (this.#modeInternal.orientation === VerticalSpanned) ? hinge.x : hinge.y,
            maskLength: (this.#modeInternal.orientation === VerticalSpanned) ? hinge.width : hinge.height,
        };
    }
}
export class Insets {
    left;
    top;
    right;
    bottom;
    constructor(left, top, right, bottom) {
        this.left = left;
        this.top = top;
        this.right = right;
        this.bottom = bottom;
    }
    isEqual(insets) {
        return insets !== null && this.left === insets.left && this.top === insets.top && this.right === insets.right &&
            this.bottom === insets.bottom;
    }
}
export class Rect {
    left;
    top;
    width;
    height;
    constructor(left, top, width, height) {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
    }
    isEqual(rect) {
        return rect !== null && this.left === rect.left && this.top === rect.top && this.width === rect.width &&
            this.height === rect.height;
    }
    scale(scale) {
        return new Rect(this.left * scale, this.top * scale, this.width * scale, this.height * scale);
    }
    relativeTo(origin) {
        return new Rect(this.left - origin.left, this.top - origin.top, this.width, this.height);
    }
    rebaseTo(origin) {
        return new Rect(this.left + origin.left, this.top + origin.top, this.width, this.height);
    }
}
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var Type;
(function (Type) {
    Type["None"] = "None";
    Type["Responsive"] = "Responsive";
    Type["Device"] = "Device";
})(Type || (Type = {}));
// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export var UA;
(function (UA) {
    // TODO(crbug.com/1136655): This enum is used for both display and code functionality.
    // we should refactor this so localization of these strings only happens for user display.
    UA["Mobile"] = "Mobile";
    UA["MobileNoTouch"] = "Mobile (no touch)";
    UA["Desktop"] = "Desktop";
    UA["DesktopTouch"] = "Desktop (touch)";
})(UA || (UA = {}));
export const MinDeviceSize = 50;
export const MaxDeviceSize = 9999;
export const MinDeviceScaleFactor = 0;
export const MaxDeviceScaleFactor = 10;
export const MaxDeviceNameLength = 50;
const mobileUserAgent = 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s Mobile Safari/537.36';
const defaultMobileUserAgent = SDK.NetworkManager.MultitargetNetworkManager.patchUserAgentWithChromeVersion(mobileUserAgent);
const defaultMobileUserAgentMetadata = {
    platform: 'Android',
    platformVersion: '6.0',
    architecture: '',
    model: 'Nexus 5',
    mobile: true,
};
export const defaultMobileScaleFactor = 2;
//# sourceMappingURL=DeviceModeModel.js.map
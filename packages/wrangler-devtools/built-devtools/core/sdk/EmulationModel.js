// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import { CSSModel } from './CSSModel.js';
import { MultitargetNetworkManager } from './NetworkManager.js';
import { Events, OverlayModel } from './OverlayModel.js';
import { Capability } from './Target.js';
import { SDKModel } from './SDKModel.js';
export class EmulationModel extends SDKModel {
    #emulationAgent;
    #deviceOrientationAgent;
    #cssModel;
    #overlayModelInternal;
    #mediaConfiguration;
    #touchEnabled;
    #touchMobile;
    #touchEmulationAllowed;
    #customTouchEnabled;
    #touchConfiguration;
    constructor(target) {
        super(target);
        this.#emulationAgent = target.emulationAgent();
        this.#deviceOrientationAgent = target.deviceOrientationAgent();
        this.#cssModel = target.model(CSSModel);
        this.#overlayModelInternal = target.model(OverlayModel);
        if (this.#overlayModelInternal) {
            this.#overlayModelInternal.addEventListener(Events.InspectModeWillBeToggled, () => {
                void this.updateTouch();
            }, this);
        }
        const disableJavascriptSetting = Common.Settings.Settings.instance().moduleSetting('javaScriptDisabled');
        disableJavascriptSetting.addChangeListener(async () => await this.#emulationAgent.invoke_setScriptExecutionDisabled({ value: disableJavascriptSetting.get() }));
        if (disableJavascriptSetting.get()) {
            void this.#emulationAgent.invoke_setScriptExecutionDisabled({ value: true });
        }
        const touchSetting = Common.Settings.Settings.instance().moduleSetting('emulation.touch');
        touchSetting.addChangeListener(() => {
            const settingValue = touchSetting.get();
            void this.overrideEmulateTouch(settingValue === 'force');
        });
        const idleDetectionSetting = Common.Settings.Settings.instance().moduleSetting('emulation.idleDetection');
        idleDetectionSetting.addChangeListener(async () => {
            const settingValue = idleDetectionSetting.get();
            if (settingValue === 'none') {
                await this.clearIdleOverride();
                return;
            }
            const emulationParams = JSON.parse(settingValue);
            await this.setIdleOverride(emulationParams);
        });
        const mediaTypeSetting = Common.Settings.Settings.instance().moduleSetting('emulatedCSSMedia');
        const mediaFeatureColorGamutSetting = Common.Settings.Settings.instance().moduleSetting('emulatedCSSMediaFeatureColorGamut');
        const mediaFeaturePrefersColorSchemeSetting = Common.Settings.Settings.instance().moduleSetting('emulatedCSSMediaFeaturePrefersColorScheme');
        const mediaFeatureForcedColorsSetting = Common.Settings.Settings.instance().moduleSetting('emulatedCSSMediaFeatureForcedColors');
        const mediaFeaturePrefersContrastSetting = Common.Settings.Settings.instance().moduleSetting('emulatedCSSMediaFeaturePrefersContrast');
        const mediaFeaturePrefersReducedDataSetting = Common.Settings.Settings.instance().moduleSetting('emulatedCSSMediaFeaturePrefersReducedData');
        const mediaFeaturePrefersReducedMotionSetting = Common.Settings.Settings.instance().moduleSetting('emulatedCSSMediaFeaturePrefersReducedMotion');
        // Note: this uses a different format than what the CDP API expects,
        // because we want to update these values per media type/feature
        // without having to search the `features` array (inefficient) or
        // hardcoding the indices (not readable/maintainable).
        this.#mediaConfiguration = new Map([
            ['type', mediaTypeSetting.get()],
            ['color-gamut', mediaFeatureColorGamutSetting.get()],
            ['prefers-color-scheme', mediaFeaturePrefersColorSchemeSetting.get()],
            ['forced-colors', mediaFeatureForcedColorsSetting.get()],
            ['prefers-contrast', mediaFeaturePrefersContrastSetting.get()],
            ['prefers-reduced-data', mediaFeaturePrefersReducedDataSetting.get()],
            ['prefers-reduced-motion', mediaFeaturePrefersReducedMotionSetting.get()],
        ]);
        mediaTypeSetting.addChangeListener(() => {
            this.#mediaConfiguration.set('type', mediaTypeSetting.get());
            void this.updateCssMedia();
        });
        mediaFeatureColorGamutSetting.addChangeListener(() => {
            this.#mediaConfiguration.set('color-gamut', mediaFeatureColorGamutSetting.get());
            void this.updateCssMedia();
        });
        mediaFeaturePrefersColorSchemeSetting.addChangeListener(() => {
            this.#mediaConfiguration.set('prefers-color-scheme', mediaFeaturePrefersColorSchemeSetting.get());
            void this.updateCssMedia();
        });
        mediaFeatureForcedColorsSetting.addChangeListener(() => {
            this.#mediaConfiguration.set('forced-colors', mediaFeatureForcedColorsSetting.get());
            void this.updateCssMedia();
        });
        mediaFeaturePrefersContrastSetting.addChangeListener(() => {
            this.#mediaConfiguration.set('prefers-contrast', mediaFeaturePrefersContrastSetting.get());
            void this.updateCssMedia();
        });
        mediaFeaturePrefersReducedDataSetting.addChangeListener(() => {
            this.#mediaConfiguration.set('prefers-reduced-data', mediaFeaturePrefersReducedDataSetting.get());
            void this.updateCssMedia();
        });
        mediaFeaturePrefersReducedMotionSetting.addChangeListener(() => {
            this.#mediaConfiguration.set('prefers-reduced-motion', mediaFeaturePrefersReducedMotionSetting.get());
            void this.updateCssMedia();
        });
        void this.updateCssMedia();
        const autoDarkModeSetting = Common.Settings.Settings.instance().moduleSetting('emulateAutoDarkMode');
        autoDarkModeSetting.addChangeListener(() => {
            const enabled = autoDarkModeSetting.get();
            mediaFeaturePrefersColorSchemeSetting.setDisabled(enabled);
            mediaFeaturePrefersColorSchemeSetting.set(enabled ? 'dark' : '');
            void this.emulateAutoDarkMode(enabled);
        });
        if (autoDarkModeSetting.get()) {
            mediaFeaturePrefersColorSchemeSetting.setDisabled(true);
            mediaFeaturePrefersColorSchemeSetting.set('dark');
            void this.emulateAutoDarkMode(true);
        }
        const visionDeficiencySetting = Common.Settings.Settings.instance().moduleSetting('emulatedVisionDeficiency');
        visionDeficiencySetting.addChangeListener(() => this.emulateVisionDeficiency(visionDeficiencySetting.get()));
        if (visionDeficiencySetting.get()) {
            void this.emulateVisionDeficiency(visionDeficiencySetting.get());
        }
        const localFontsDisabledSetting = Common.Settings.Settings.instance().moduleSetting('localFontsDisabled');
        localFontsDisabledSetting.addChangeListener(() => this.setLocalFontsDisabled(localFontsDisabledSetting.get()));
        if (localFontsDisabledSetting.get()) {
            this.setLocalFontsDisabled(localFontsDisabledSetting.get());
        }
        const avifFormatDisabledSetting = Common.Settings.Settings.instance().moduleSetting('avifFormatDisabled');
        const jpegXlFormatDisabledSetting = Common.Settings.Settings.instance().moduleSetting('jpegXlFormatDisabled');
        const webpFormatDisabledSetting = Common.Settings.Settings.instance().moduleSetting('webpFormatDisabled');
        const updateDisabledImageFormats = () => {
            const types = [];
            if (avifFormatDisabledSetting.get()) {
                types.push("avif" /* Avif */);
            }
            if (jpegXlFormatDisabledSetting.get()) {
                types.push("jxl" /* Jxl */);
            }
            if (webpFormatDisabledSetting.get()) {
                types.push("webp" /* Webp */);
            }
            this.setDisabledImageTypes(types);
        };
        avifFormatDisabledSetting.addChangeListener(updateDisabledImageFormats);
        webpFormatDisabledSetting.addChangeListener(updateDisabledImageFormats);
        jpegXlFormatDisabledSetting.addChangeListener(updateDisabledImageFormats);
        if (avifFormatDisabledSetting.get() || jpegXlFormatDisabledSetting.get() || webpFormatDisabledSetting.get()) {
            updateDisabledImageFormats();
        }
        this.#touchEmulationAllowed = true;
        this.#touchEnabled = false;
        this.#touchMobile = false;
        this.#customTouchEnabled = false;
        this.#touchConfiguration = {
            enabled: false,
            configuration: "mobile" /* Mobile */,
        };
    }
    setTouchEmulationAllowed(touchEmulationAllowed) {
        this.#touchEmulationAllowed = touchEmulationAllowed;
    }
    supportsDeviceEmulation() {
        return this.target().hasAllCapabilities(Capability.DeviceEmulation);
    }
    async resetPageScaleFactor() {
        await this.#emulationAgent.invoke_resetPageScaleFactor();
    }
    async emulateDevice(metrics) {
        if (metrics) {
            await this.#emulationAgent.invoke_setDeviceMetricsOverride(metrics);
        }
        else {
            await this.#emulationAgent.invoke_clearDeviceMetricsOverride();
        }
    }
    overlayModel() {
        return this.#overlayModelInternal;
    }
    async emulateLocation(location) {
        if (!location || location.error) {
            await Promise.all([
                this.#emulationAgent.invoke_clearGeolocationOverride(),
                this.#emulationAgent.invoke_setTimezoneOverride({ timezoneId: '' }),
                this.#emulationAgent.invoke_setLocaleOverride({ locale: '' }),
                this.#emulationAgent.invoke_setUserAgentOverride({ userAgent: MultitargetNetworkManager.instance().currentUserAgent() }),
            ]);
        }
        else {
            function processEmulationResult(errorType, result) {
                const errorMessage = result.getError();
                if (errorMessage) {
                    return Promise.reject({
                        type: errorType,
                        message: errorMessage,
                    });
                }
                return Promise.resolve();
            }
            await Promise.all([
                this.#emulationAgent
                    .invoke_setGeolocationOverride({
                    latitude: location.latitude,
                    longitude: location.longitude,
                    accuracy: Location.defaultGeoMockAccuracy,
                })
                    .then(result => processEmulationResult('emulation-set-location', result)),
                this.#emulationAgent
                    .invoke_setTimezoneOverride({
                    timezoneId: location.timezoneId,
                })
                    .then(result => processEmulationResult('emulation-set-timezone', result)),
                this.#emulationAgent
                    .invoke_setLocaleOverride({
                    locale: location.locale,
                })
                    .then(result => processEmulationResult('emulation-set-locale', result)),
                this.#emulationAgent
                    .invoke_setUserAgentOverride({
                    userAgent: MultitargetNetworkManager.instance().currentUserAgent(),
                    acceptLanguage: location.locale,
                })
                    .then(result => processEmulationResult('emulation-set-user-agent', result)),
            ]);
        }
    }
    async emulateDeviceOrientation(deviceOrientation) {
        if (deviceOrientation) {
            await this.#deviceOrientationAgent.invoke_setDeviceOrientationOverride({ alpha: deviceOrientation.alpha, beta: deviceOrientation.beta, gamma: deviceOrientation.gamma });
        }
        else {
            await this.#deviceOrientationAgent.invoke_clearDeviceOrientationOverride();
        }
    }
    async setIdleOverride(emulationParams) {
        await this.#emulationAgent.invoke_setIdleOverride(emulationParams);
    }
    async clearIdleOverride() {
        await this.#emulationAgent.invoke_clearIdleOverride();
    }
    async emulateCSSMedia(type, features) {
        await this.#emulationAgent.invoke_setEmulatedMedia({ media: type, features });
        if (this.#cssModel) {
            this.#cssModel.mediaQueryResultChanged();
        }
    }
    async emulateAutoDarkMode(enabled) {
        if (enabled) {
            this.#mediaConfiguration.set('prefers-color-scheme', 'dark');
            await this.updateCssMedia();
        }
        // We never send `enabled: false` since that would explicitly disable
        // autodark mode. We either enable it or clear any existing override.
        await this.#emulationAgent.invoke_setAutoDarkModeOverride({ enabled: enabled || undefined });
    }
    async emulateVisionDeficiency(type) {
        await this.#emulationAgent.invoke_setEmulatedVisionDeficiency({ type });
    }
    setLocalFontsDisabled(disabled) {
        if (!this.#cssModel) {
            return;
        }
        void this.#cssModel.setLocalFontsEnabled(!disabled);
    }
    setDisabledImageTypes(imageTypes) {
        void this.#emulationAgent.invoke_setDisabledImageTypes({ imageTypes });
    }
    async setCPUThrottlingRate(rate) {
        await this.#emulationAgent.invoke_setCPUThrottlingRate({ rate });
    }
    async setHardwareConcurrency(hardwareConcurrency) {
        if (hardwareConcurrency < 1) {
            throw new Error('hardwareConcurrency must be a positive value');
        }
        await this.#emulationAgent.invoke_setHardwareConcurrencyOverride({ hardwareConcurrency });
    }
    async emulateTouch(enabled, mobile) {
        this.#touchEnabled = enabled && this.#touchEmulationAllowed;
        this.#touchMobile = mobile && this.#touchEmulationAllowed;
        await this.updateTouch();
    }
    async overrideEmulateTouch(enabled) {
        this.#customTouchEnabled = enabled && this.#touchEmulationAllowed;
        await this.updateTouch();
    }
    async updateTouch() {
        let configuration = {
            enabled: this.#touchEnabled,
            configuration: this.#touchMobile ? "mobile" /* Mobile */ :
                "desktop" /* Desktop */,
        };
        if (this.#customTouchEnabled) {
            configuration = {
                enabled: true,
                configuration: "mobile" /* Mobile */,
            };
        }
        if (this.#overlayModelInternal && this.#overlayModelInternal.inspectModeEnabled()) {
            configuration = {
                enabled: false,
                configuration: "mobile" /* Mobile */,
            };
        }
        if (!this.#touchConfiguration.enabled && !configuration.enabled) {
            return;
        }
        if (this.#touchConfiguration.enabled && configuration.enabled &&
            this.#touchConfiguration.configuration === configuration.configuration) {
            return;
        }
        this.#touchConfiguration = configuration;
        await this.#emulationAgent.invoke_setTouchEmulationEnabled({ enabled: configuration.enabled, maxTouchPoints: 1 });
        await this.#emulationAgent.invoke_setEmitTouchEventsForMouse({ enabled: configuration.enabled, configuration: configuration.configuration });
    }
    async updateCssMedia() {
        // See the note above, where this.#mediaConfiguration is defined.
        const type = this.#mediaConfiguration.get('type') ?? '';
        const features = [
            {
                name: 'color-gamut',
                value: this.#mediaConfiguration.get('color-gamut') ?? '',
            },
            {
                name: 'prefers-color-scheme',
                value: this.#mediaConfiguration.get('prefers-color-scheme') ?? '',
            },
            {
                name: 'forced-colors',
                value: this.#mediaConfiguration.get('forced-colors') ?? '',
            },
            {
                name: 'prefers-contrast',
                value: this.#mediaConfiguration.get('prefers-contrast') ?? '',
            },
            {
                name: 'prefers-reduced-data',
                value: this.#mediaConfiguration.get('prefers-reduced-data') ?? '',
            },
            {
                name: 'prefers-reduced-motion',
                value: this.#mediaConfiguration.get('prefers-reduced-motion') ?? '',
            },
        ];
        return this.emulateCSSMedia(type, features);
    }
}
export class Location {
    latitude;
    longitude;
    timezoneId;
    locale;
    error;
    constructor(latitude, longitude, timezoneId, locale, error) {
        this.latitude = latitude;
        this.longitude = longitude;
        this.timezoneId = timezoneId;
        this.locale = locale;
        this.error = error;
    }
    static parseSetting(value) {
        if (value) {
            const [position, timezoneId, locale, error] = value.split(':');
            const [latitude, longitude] = position.split('@');
            return new Location(parseFloat(latitude), parseFloat(longitude), timezoneId, locale, Boolean(error));
        }
        return new Location(0, 0, '', '', false);
    }
    static parseUserInput(latitudeString, longitudeString, timezoneId, locale) {
        if (!latitudeString && !longitudeString) {
            return null;
        }
        const { valid: isLatitudeValid } = Location.latitudeValidator(latitudeString);
        const { valid: isLongitudeValid } = Location.longitudeValidator(longitudeString);
        if (!isLatitudeValid && !isLongitudeValid) {
            return null;
        }
        const latitude = isLatitudeValid ? parseFloat(latitudeString) : -1;
        const longitude = isLongitudeValid ? parseFloat(longitudeString) : -1;
        return new Location(latitude, longitude, timezoneId, locale, false);
    }
    static latitudeValidator(value) {
        const numValue = parseFloat(value);
        const valid = /^([+-]?[\d]+(\.\d+)?|[+-]?\.\d+)$/.test(value) && numValue >= -90 && numValue <= 90;
        return { valid, errorMessage: undefined };
    }
    static longitudeValidator(value) {
        const numValue = parseFloat(value);
        const valid = /^([+-]?[\d]+(\.\d+)?|[+-]?\.\d+)$/.test(value) && numValue >= -180 && numValue <= 180;
        return { valid, errorMessage: undefined };
    }
    static timezoneIdValidator(value) {
        // Chromium uses ICU's timezone implementation, which is very
        // liberal in what it accepts. ICU does not simply use an allowlist
        // but instead tries to make sense of the input, even for
        // weird-looking timezone IDs. There's not much point in validating
        // the input other than checking if it contains at least one alphabet.
        // The empty string resets the override, and is accepted as well.
        const valid = value === '' || /[a-zA-Z]/.test(value);
        return { valid, errorMessage: undefined };
    }
    static localeValidator(value) {
        // Similarly to timezone IDs, there's not much point in validating
        // input locales other than checking if it contains at least two
        // alphabetic characters.
        // https://unicode.org/reports/tr35/#Unicode_language_identifier
        // The empty string resets the override, and is accepted as
        // well.
        const valid = value === '' || /[a-zA-Z]{2}/.test(value);
        return { valid, errorMessage: undefined };
    }
    toSetting() {
        return `${this.latitude}@${this.longitude}:${this.timezoneId}:${this.locale}:${this.error || ''}`;
    }
    static defaultGeoMockAccuracy = 150;
}
export class DeviceOrientation {
    alpha;
    beta;
    gamma;
    constructor(alpha, beta, gamma) {
        this.alpha = alpha;
        this.beta = beta;
        this.gamma = gamma;
    }
    static parseSetting(value) {
        if (value) {
            const jsonObject = JSON.parse(value);
            return new DeviceOrientation(jsonObject.alpha, jsonObject.beta, jsonObject.gamma);
        }
        return new DeviceOrientation(0, 0, 0);
    }
    static parseUserInput(alphaString, betaString, gammaString) {
        if (!alphaString && !betaString && !gammaString) {
            return null;
        }
        const { valid: isAlphaValid } = DeviceOrientation.alphaAngleValidator(alphaString);
        const { valid: isBetaValid } = DeviceOrientation.betaAngleValidator(betaString);
        const { valid: isGammaValid } = DeviceOrientation.gammaAngleValidator(gammaString);
        if (!isAlphaValid && !isBetaValid && !isGammaValid) {
            return null;
        }
        const alpha = isAlphaValid ? parseFloat(alphaString) : -1;
        const beta = isBetaValid ? parseFloat(betaString) : -1;
        const gamma = isGammaValid ? parseFloat(gammaString) : -1;
        return new DeviceOrientation(alpha, beta, gamma);
    }
    static angleRangeValidator(value, interval) {
        const numValue = parseFloat(value);
        const valid = /^([+-]?[\d]+(\.\d+)?|[+-]?\.\d+)$/.test(value) && numValue >= interval.minimum && numValue < interval.maximum;
        return { valid, errorMessage: undefined };
    }
    static alphaAngleValidator(value) {
        return DeviceOrientation.angleRangeValidator(value, { minimum: -180, maximum: 180 });
    }
    static betaAngleValidator(value) {
        return DeviceOrientation.angleRangeValidator(value, { minimum: -180, maximum: 180 });
    }
    static gammaAngleValidator(value) {
        return DeviceOrientation.angleRangeValidator(value, { minimum: -90, maximum: 90 });
    }
    toSetting() {
        return JSON.stringify(this);
    }
}
SDKModel.register(EmulationModel, { capabilities: Capability.Emulation, autostart: true });
//# sourceMappingURL=EmulationModel.js.map